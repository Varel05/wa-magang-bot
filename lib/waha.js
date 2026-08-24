const { WAHA_BASE_URL, WAHA_API_KEY, WAHA_SESSION } = process.env;

const BASE_URL = (WAHA_BASE_URL || 'http://waha:3000').replace(/\/$/, '');
const DEFAULT_SESSION = WAHA_SESSION || 'default';

function wahaHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (WAHA_API_KEY) headers['X-Api-Key'] = WAHA_API_KEY;
  return headers;
}

/**
 * Kirim pesan teks lewat WAHA.
 * chatId harus format WhatsApp mentah, mis. "6281234567890@c.us" (bukan cuma nomornya saja).
 */
export async function sendWahaText(session, chatId, text) {
  const res = await fetch(`${BASE_URL}/api/sendText`, {
    method: 'POST',
    headers: wahaHeaders(),
    body: JSON.stringify({
      session: session || DEFAULT_SESSION,
      chatId,
      text,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error('❌ Gagal kirim pesan via WAHA:', errBody);
    throw new Error(`Gagal kirim pesan via WAHA: ${errBody}`);
  }
}

/**
 * Tampilkan status "mengetik..." ke chat tertentu. Tidak fatal kalau gagal.
 */
export async function startTyping(session, chatId) {
  try {
    await fetch(`${BASE_URL}/api/startTyping`, {
      method: 'POST',
      headers: wahaHeaders(),
      body: JSON.stringify({ session: session || DEFAULT_SESSION, chatId }),
    });
  } catch (err) {
    console.error('❌ Gagal kirim status mengetik (start):', err.message);
  }
}

/**
 * Matikan status "mengetik..." sebelum kirim balasan. Tidak fatal kalau gagal.
 */
export async function stopTyping(session, chatId) {
  try {
    await fetch(`${BASE_URL}/api/stopTyping`, {
      method: 'POST',
      headers: wahaHeaders(),
      body: JSON.stringify({ session: session || DEFAULT_SESSION, chatId }),
    });
  } catch (err) {
    console.error('❌ Gagal kirim status mengetik (stop):', err.message);
  }
}

/**
 * Cek status koneksi WhatsApp (WORKING = siap kirim/terima pesan).
 * Dipakai buat health-check kalau perlu.
 */
export async function getSessionStatus(session) {
  const res = await fetch(`${BASE_URL}/api/sessions/${session || DEFAULT_SESSION}`, {
    headers: wahaHeaders(),
  });
  if (!res.ok) return null;
  return res.json();
}
