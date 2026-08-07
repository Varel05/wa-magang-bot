import { askGemini } from '../lib/askGemini.js';
import { sendTelegramMessage, sendTelegramTyping } from '../lib/telegram.js';

const { TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET } = process.env;

const FALLBACK_MESSAGE =
  'Maaf, sistem sedang gangguan sebentar. Silakan coba lagi dalam beberapa menit, atau hubungi admin magang secara langsung.';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // Verifikasi request memang datang dari Telegram (bukan orang lain yang menembak endpoint ini).
  // Header ini otomatis dikirim Telegram kalau secret_token diisi saat setWebhook (lihat README).
  if (TELEGRAM_WEBHOOK_SECRET) {
    const incomingSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (incomingSecret !== TELEGRAM_WEBHOOK_SECRET) {
      return res.status(401).send('Unauthorized');
    }
  }

  try {
    const message = req.body?.message;
    if (!message) return res.status(200).send('OK'); // bisa jadi update jenis lain — abaikan

    const chatId = message.chat?.id;
    const text = message.text;

    if (!chatId) return res.status(200).send('OK');

    if (!text) {
      await sendTelegramMessage(TELEGRAM_BOT_TOKEN, chatId, 'Maaf, saat ini bot hanya bisa membaca pesan berupa teks.');
      return res.status(200).send('OK');
    }

    console.log(`📩 [Telegram] Pesan dari ${chatId}: ${text}`);

    await sendTelegramTyping(TELEGRAM_BOT_TOKEN, chatId);

    let reply;
    try {
      reply = await askGemini(text);
    } catch (err) {
      console.error('❌ Error dari Gemini API:', err.message);
      reply = FALLBACK_MESSAGE;
    }

    await sendTelegramMessage(TELEGRAM_BOT_TOKEN, chatId, reply);
    console.log(`✅ [Telegram] Terjawab untuk ${chatId}`);

    return res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Error memproses webhook Telegram:', err.response?.data || err.message);
    return res.status(200).send('OK'); // tetap balas 200 supaya Telegram tidak retry terus-menerus
  }
}
