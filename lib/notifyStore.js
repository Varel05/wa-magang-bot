const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = process.env;

const NOTIF_KEY = 'notifications:feed';
const MAX_NOTIFICATIONS = 50; // simpan cuma 50 notifikasi terakhir, biar list tidak numpuk selamanya

function configured() {
  return Boolean(UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN);
}

async function upstashCommand(command) {
  const res = await fetch(UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  return data.result;
}

/**
 * Catat notifikasi "pesan baru masuk" — dipanggil dari webhook.js / telegram.js
 * tiap kali ada pesan masuk dari user.
 */
export async function pushNotification({ channel, contactId, preview }) {
  if (!configured()) return;

  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    channel,
    contactId,
    preview: (preview || '').slice(0, 140),
    timestamp: Date.now(),
  };

  try {
    await upstashCommand(['LPUSH', NOTIF_KEY, JSON.stringify(item)]);
    await upstashCommand(['LTRIM', NOTIF_KEY, '0', String(MAX_NOTIFICATIONS - 1)]);
  } catch (err) {
    console.error('❌ Gagal simpan notifikasi:', err.message);
    // bukan fatal — kalau gagal, bot tetap lanjut balas pesan seperti biasa
  }
}

/**
 * Ambil notifikasi yang lebih baru dari `sinceTimestamp` (ms), urut lama → baru.
 * Dipakai halaman /admin buat polling berkala.
 */
export async function getRecentNotifications(sinceTimestamp = 0) {
  if (!configured()) return [];

  try {
    const raw = await upstashCommand(['LRANGE', NOTIF_KEY, '0', String(MAX_NOTIFICATIONS - 1)]);
    const items = raw.map((r) => JSON.parse(r));
    return items
      .filter((n) => n.timestamp > sinceTimestamp)
      .sort((a, b) => a.timestamp - b.timestamp);
  } catch (err) {
    console.error('❌ Gagal ambil notifikasi:', err.message);
    return [];
  }
}
