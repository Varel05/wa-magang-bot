import { askGemini } from '../lib/askGemini.js';
import { isFirstMessage } from '../lib/seenStore.js';
import { GREETING_MESSAGE } from '../lib/faq.js';

const {
  WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_VERIFY_TOKEN,
} = process.env;

const GRAPH_API_URL = `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

const FALLBACK_MESSAGE =
  'Maaf, sistem sedang gangguan sebentar. Silakan coba lagi dalam beberapa menit, atau hubungi admin magang secara langsung.';

export default async function handler(req, res) {
  // --- 1) Verifikasi webhook (dipanggil Meta sekali saat Anda simpan Callback URL) ---
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  // --- 2) Terima pesan masuk ---
  if (req.method === 'POST') {
    try {
      const entry = req.body?.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const message = value?.messages?.[0];
      const status = value?.statuses?.[0];

      if (status) {
        // Event status pengiriman pesan yang KITA kirim sebelumnya (sent/delivered/read/failed)
        console.log(`📶 Status pesan ke ${status.recipient_id}: ${status.status}`);
        if (status.status === 'failed') {
          console.error('❌ Detail kegagalan pengiriman:', JSON.stringify(status.errors));
        }
        return res.status(200).send('OK');
      }

      if (!message) return res.status(200).send('OK'); // event lain yang tidak dikenali — abaikan

      const from = message.from;
      const text = message.text?.body;

      if (!text) {
        await sendWhatsAppMessage(from, 'Maaf, saat ini bot hanya bisa membaca pesan berupa teks.');
        return res.status(200).send('OK');
      }

      console.log(`📩 Pesan dari ${from}: ${text}`);

      // Kalau ini pesan pertama dari nomor ini, kirim perkenalan dulu — belum jawab pertanyaannya.
      const firstTime = await isFirstMessage('whatsapp', from);
      if (firstTime) {
        try {
          await sendWhatsAppMessage(from, GREETING_MESSAGE);
          console.log(`👋 Perkenalan terkirim untuk ${from}`);
        } catch (err) {
          console.error(`❌ Gagal kirim perkenalan untuk ${from}`);
        }
        return res.status(200).send('OK');
      }

      let reply;
      try {
        reply = await askGemini(text);
      } catch (err) {
        console.error('❌ Error dari Gemini API:', err.message);
        reply = FALLBACK_MESSAGE;
      }

      await sendWhatsAppMessage(from, reply);
      console.log(`✅ Terjawab untuk ${from}`);

      return res.status(200).send('OK');
    } catch (err) {
      console.error('❌ Error memproses webhook:', err.response?.data || err.message);
      return res.status(200).send('OK'); // tetap balas 200 supaya Meta tidak retry terus-menerus
    }
  }

  res.status(405).send('Method Not Allowed');
}

async function sendWhatsAppMessage(to, text) {
  const res = await fetch(GRAPH_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error('❌ Gagal kirim pesan WhatsApp:', errBody);
    throw new Error(`Gagal kirim pesan WhatsApp: ${errBody}`);
  }

  const data = await res.json();
  console.log('📤 Respons Meta:', JSON.stringify(data));
}
