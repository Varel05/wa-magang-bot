import 'dotenv/config';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import axios from 'axios';
import pino from 'pino';
import qrcode from 'qrcode-terminal';

const LANGFLOW_API_URL = process.env.LANGFLOW_API_URL;
const LANGFLOW_API_KEY = process.env.LANGFLOW_API_KEY;
const TYPING_DELAY_MS = Number(process.env.TYPING_DELAY_MS || 1200);

// Pesan fallback kalau Langflow error / tidak merespon
const FALLBACK_MESSAGE =
  'Maaf, sistem sedang gangguan sebentar. Silakan coba lagi dalam beberapa menit, atau hubungi admin magang secara langsung.';

/**
 * Kirim pertanyaan user ke Langflow, dapatkan jawaban AI.
 * sessionId dipakai supaya Langflow bisa menjaga konteks percakapan per-nomor WhatsApp.
 */
async function askLangflow(message, sessionId) {
  const payload = {
    input_value: message,
    output_type: 'chat',
    input_type: 'chat',
    session_id: sessionId,
  };

  const headers = { 'Content-Type': 'application/json' };
  if (LANGFLOW_API_KEY) headers['x-api-key'] = LANGFLOW_API_KEY;

  const { data } = await axios.post(LANGFLOW_API_URL, payload, { headers, timeout: 30000 });

  // Struktur respons Langflow bisa bervariasi tergantung komponen output flow Anda.
  // Path umum untuk flow "Chat Output":
  try {
    const text =
      data?.outputs?.[0]?.outputs?.[0]?.results?.message?.text ??
      data?.outputs?.[0]?.outputs?.[0]?.results?.message?.data?.text ??
      data?.outputs?.[0]?.outputs?.[0]?.artifacts?.message;
    if (text) return text;
  } catch (_) {
    // lanjut ke fallback di bawah
  }

  console.warn('Struktur respons Langflow tidak dikenali, cek console.log(data) untuk menyesuaikan path.');
  console.log(JSON.stringify(data, null, 2));
  return FALLBACK_MESSAGE;
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_session');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('Scan QR code berikut dengan WhatsApp (Perangkat Tertaut):');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect =
        new Boom(lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Koneksi terputus, reconnect:', shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('✅ Bot WhatsApp terhubung dan siap menjawab calon pemagang.');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const remoteJid = msg.key.remoteJid;
      const isGroup = remoteJid.endsWith('@g.us');
      if (isGroup) continue; // abaikan grup, bot ini untuk chat pribadi calon pemagang

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        '';

      if (!text.trim()) continue;

      console.log(`📩 Pesan dari ${remoteJid}: ${text}`);

      try {
        // Tampilkan status "mengetik..." agar terasa natural
        await sock.sendPresenceUpdate('composing', remoteJid);
        await new Promise((r) => setTimeout(r, TYPING_DELAY_MS));

        const reply = await askLangflow(text, remoteJid);

        await sock.sendMessage(remoteJid, { text: reply });
        console.log(`✅ Terjawab untuk ${remoteJid}`);
      } catch (err) {
        console.error('❌ Error saat memproses pesan:', err.message);
        await sock.sendMessage(remoteJid, { text: FALLBACK_MESSAGE });
      }
    }
  });
}

if (!LANGFLOW_API_URL) {
  console.error('⚠️  LANGFLOW_API_URL belum diatur. Salin .env.example menjadi .env lalu isi nilainya.');
  process.exit(1);
}

startBot();
