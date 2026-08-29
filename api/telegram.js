import { askGemini } from '../lib/askGemini.js';
import { sendTelegramMessage, sendTelegramTyping } from '../lib/telegram.js';
import { isFirstMessage } from '../lib/seenStore.js';
import { getHistory, appendToHistory, getRecentContext } from '../lib/historyStore.js';
import { pushNotification } from '../lib/notifyStore.js';
import { GREETING_MESSAGE } from '../lib/faq.js';

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

    // Catat notifikasi buat panel admin — tidak fatal kalau gagal, bot tetap lanjut balas.
    try {
      await pushNotification({ channel: 'telegram', contactId: chatId, preview: text });
    } catch (err) {
      console.error('❌ Gagal catat notifikasi:', err.message);
    }

    // Kalau ini pesan pertama dari chat ini, kirim perkenalan dulu — belum jawab pertanyaannya.
    const firstTime = await isFirstMessage('telegram', chatId);
    if (firstTime) {
      await sendTelegramMessage(TELEGRAM_BOT_TOKEN, chatId, GREETING_MESSAGE);
      await appendToHistory('telegram', chatId, text, GREETING_MESSAGE);
      console.log(`👋 [Telegram] Perkenalan terkirim untuk ${chatId}`);
      return res.status(200).send('OK');
    }

    await sendTelegramTyping(TELEGRAM_BOT_TOKEN, chatId);

    let reply;
    try {
      const history = await getHistory('telegram', chatId);
      reply = await askGemini(text, getRecentContext(history));
      await appendToHistory('telegram', chatId, text, reply);
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
