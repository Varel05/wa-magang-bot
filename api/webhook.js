import { askGemini } from '../lib/askGemini.js';
import { isFirstMessage } from '../lib/seenStore.js';
import { getHistory, appendToHistory } from '../lib/historyStore.js';
import { pushNotification } from '../lib/notifyStore.js';
import { GREETING_MESSAGE } from '../lib/faq.js';

// Naikkan batas waktu eksekusi function (default Vercel Hobby cuma 10 detik) —
// perlu lebih lega karena sekarang ada delay simulasi "mengetik" + panggilan Gemini.
export const config = {
  maxDuration: 30,
};

const {
  WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_VERIFY_TOKEN,
} = process.env;

const GRAPH_API_URL = `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

// Durasi status "mengetik" = jumlah kata balasan / 5 detik, dibatasi biar aman dari timeout function.
const TYPING_WORDS_PER_SECOND = 5;
const MAX_TYPING_DELAY_SECONDS = 8; // sesuaikan kalau maxDuration function Vercel Anda lebih besar
const MIN_TYPING_DELAY_SECONDS = 1;

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
      const messageId = message.id;
      const text = message.text?.body;

      if (!text) {
        await sendWhatsAppMessage(from, 'Maaf, saat ini bot hanya bisa membaca pesan berupa teks.');
        return res.status(200).send('OK');
      }

      console.log(`📩 Pesan dari ${from}: ${text}`);

      // Catat notifikasi buat panel admin — tidak fatal kalau gagal, bot tetap lanjut balas.
      try {
        await pushNotification({ channel: 'whatsapp', contactId: from, preview: text });
      } catch (err) {
        console.error('❌ Gagal catat notifikasi:', err.message);
      }

      // Tandai pesan sebagai dibaca + tampilkan status "mengetik" ke user.
      // Ini yang bikin request tidak terasa "ngeblok" walau bot masih proses di belakang layar.
      await markAsReadWithTyping(messageId);

      // Kalau ini pesan pertama dari nomor ini, kirim perkenalan dulu — belum jawab pertanyaannya.
      const firstTime = await isFirstMessage('whatsapp', from);
      if (firstTime) {
        try {
          await appendToHistory('whatsapp', from, text, GREETING_MESSAGE);
          await delayForTyping(GREETING_MESSAGE);
          await sendWhatsAppMessage(from, GREETING_MESSAGE);
          console.log(`👋 Perkenalan terkirim untuk ${from}`);
        } catch (err) {
          console.error(`❌ Gagal memproses pesan pertama WhatsApp untuk ${from}:`, err.message);
        }
        return res.status(200).send('OK');
      }

      let reply;
      try {
        const history = await getHistory('whatsapp', from);
        reply = await askGemini(text, history);
        await appendToHistory('whatsapp', from, text, reply);
      } catch (err) {
        console.error('❌ Error dari Gemini API:', err.message);
        reply = FALLBACK_MESSAGE;
      }

      await delayForTyping(reply);
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

async function markAsReadWithTyping(messageId) {
  try {
    await fetch(GRAPH_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
        typing_indicator: { type: 'text' },
      }),
    });
  } catch (err) {
    // Bukan fatal — kalau gagal, bot tetap lanjut jawab, cuma tanpa status "mengetik"
    console.error('❌ Gagal kirim status mengetik:', err.message);
  }
}

/**
 * Tunggu sejenak sebelum kirim balasan, supaya terasa natural (bukan langsung "meledak" jawab).
 * Durasi = jumlah kata / TYPING_WORDS_PER_SECOND, dibatasi MIN..MAX detik.
 */
async function delayForTyping(text) {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const seconds = Math.min(
    Math.max(wordCount / TYPING_WORDS_PER_SECOND, MIN_TYPING_DELAY_SECONDS),
    MAX_TYPING_DELAY_SECONDS
  );
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
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
