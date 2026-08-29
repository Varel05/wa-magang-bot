import { askGemini } from '../lib/askGemini.js';
import { isFirstMessage } from '../lib/seenStore.js';
import { getHistory, appendToHistory, getRecentContext } from '../lib/historyStore.js';
import { pushNotification } from '../lib/notifyStore.js';
import { GREETING_MESSAGE } from '../lib/faq.js';
import { sendWahaText, startTyping, stopTyping } from '../lib/waha.js';

// Naikkan batas waktu eksekusi function (relevan kalau suatu saat dipindah lagi ke Vercel) —
// perlu lebih lega karena ada delay simulasi "mengetik" + panggilan Gemini.
export const config = {
  maxDuration: 30,
};

const { WAHA_WEBHOOK_SECRET } = process.env;

// Durasi status "mengetik" = jumlah kata balasan / 5 detik, dibatasi biar tidak kelamaan.
const TYPING_WORDS_PER_SECOND = 5;
const MAX_TYPING_DELAY_SECONDS = 8;
const MIN_TYPING_DELAY_SECONDS = 1;

const FALLBACK_MESSAGE =
  'Maaf, sistem sedang gangguan sebentar. Silakan coba lagi dalam beberapa menit, atau hubungi admin magang secara langsung.';

export default async function handler(req, res) {
  // Dipakai buat cek endpoint hidup dari browser / health-check — WAHA sendiri tidak butuh
  // langkah verifikasi seperti Meta (tidak ada hub.challenge dsb).
  if (req.method === 'GET') {
    return res.status(200).send('OK - endpoint webhook WAHA aktif');
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // Kalau WAHA_WEBHOOK_SECRET diisi, WAHA harus dikonfigurasi untuk mengirim header
  // X-Webhook-Secret dengan nilai yang sama (lewat WHATSAPP_HOOK_CUSTOM_HEADERS di env WAHA).
  // Ini mencegah orang lain menembak endpoint ini dengan payload palsu.
  if (WAHA_WEBHOOK_SECRET) {
    const incomingSecret = req.headers['x-webhook-secret'];
    if (incomingSecret !== WAHA_WEBHOOK_SECRET) {
      return res.status(401).send('Unauthorized');
    }
  }

  try {
    const { event, session, payload } = req.body || {};

    // Kita cuma peduli event "message" (pesan masuk baru). Event lain (message.ack,
    // session.status, message.reaction, dll) diabaikan.
    if (event !== 'message') return res.status(200).send('OK');
    if (!payload) return res.status(200).send('OK');

    // Abaikan pesan yang dikirim oleh bot sendiri (fromMe) — WAHA juga mengirim event
    // untuk pesan yang KITA kirim, bukan cuma yang masuk.
    if (payload.fromMe) return res.status(200).send('OK');

    const rawFrom = payload.from || ''; // contoh: "6281234567890@c.us"

    // Abaikan pesan grup, channel/newsletter, dan status — bot ini cuma layani chat pribadi 1:1.
    if (
      rawFrom.endsWith('@g.us') ||
      rawFrom.endsWith('@newsletter') ||
      rawFrom === 'status@broadcast'
    ) {
      return res.status(200).send('OK');
    }

    // Nomor mentah tanpa suffix "@c.us" — dipakai sebagai key di Redis (seenStore, historyStore, dst),
    // supaya kompatibel dengan data lama dari versi Meta Cloud API (yang juga pakai nomor mentah).
    const from = rawFrom.replace('@c.us', '');
    const text = payload.body;

    if (!text) {
      await sendWahaText(session, rawFrom, 'Maaf, saat ini bot hanya bisa membaca pesan berupa teks.');
      return res.status(200).send('OK');
    }

    console.log(`📩 Pesan dari ${from}: ${text}`);

    // Catat notifikasi buat panel admin — tidak fatal kalau gagal, bot tetap lanjut balas.
    try {
      await pushNotification({ channel: 'whatsapp', contactId: from, preview: text });
    } catch (err) {
      console.error('❌ Gagal catat notifikasi:', err.message);
    }

    // Tampilkan status "mengetik" ke user secepatnya, biar tidak terasa "ngeblok".
    await startTyping(session, rawFrom);

    // Kalau ini pesan pertama dari nomor ini, kirim perkenalan dulu — belum jawab pertanyaannya.
    const firstTime = await isFirstMessage('whatsapp', from);
    if (firstTime) {
      try {
        await appendToHistory('whatsapp', from, text, GREETING_MESSAGE);
        await delayForTyping(GREETING_MESSAGE);
        await stopTyping(session, rawFrom);
        await sendWahaText(session, rawFrom, GREETING_MESSAGE);
        console.log(`👋 Perkenalan terkirim untuk ${from}`);
      } catch (err) {
        console.error(`❌ Gagal memproses pesan pertama WhatsApp untuk ${from}:`, err.message);
      }
      return res.status(200).send('OK');
    }

    let reply;
    try {
      const history = await getHistory('whatsapp', from);
      reply = await askGemini(text, getRecentContext(history));
      await appendToHistory('whatsapp', from, text, reply);
    } catch (err) {
      console.error('❌ Error dari Gemini API:', err.message);
      reply = FALLBACK_MESSAGE;
    }

    await delayForTyping(reply);
    await stopTyping(session, rawFrom);
    await sendWahaText(session, rawFrom, reply);
    console.log(`✅ Terjawab untuk ${from}`);

    return res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Error memproses webhook:', err.response?.data || err.message);
    return res.status(200).send('OK'); // tetap balas 200 supaya WAHA tidak retry terus-menerus
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
