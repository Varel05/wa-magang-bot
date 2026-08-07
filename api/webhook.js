import { askGemini } from '../lib/askGemini.js';

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
    // Balas cepat ke Meta dulu (wajib < beberapa detik), proses tetap jalan di bawah.
    res.status(200).send('OK');

    try {
      const entry = req.body?.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const message = value?.messages?.[0];

      if (!message) return; // event status (delivered/read), bukan pesan baru — abaikan

      const from = message.from;
      const text = message.text?.body;

      if (!text) {
        await sendWhatsAppMessage(from, 'Maaf, saat ini bot hanya bisa membaca pesan berupa teks.');
        return;
      }

      console.log(`📩 Pesan dari ${from}: ${text}`);

      let reply;
      try {
        reply = await askGemini(text);
      } catch (err) {
        console.error('❌ Error dari Gemini API:', err.message);
        reply = FALLBACK_MESSAGE;
      }

      await sendWhatsAppMessage(from, reply);
      console.log(`✅ Terjawab untuk ${from}`);
    } catch (err) {
      console.error('❌ Error memproses webhook:', err.response?.data || err.message);
    }
    return;
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
  }
}
