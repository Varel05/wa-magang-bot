const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = process.env;

/**
 * Cek apakah ini PESAN PERTAMA dari user ini, sekaligus langsung menandainya sebagai "sudah pernah chat".
 * Pakai Redis SET ... NX (set-if-not-exists) supaya atomic — aman meski dua pesan datang hampir bersamaan.
 *
 * channel: "telegram" atau "whatsapp"
 * id: chat id Telegram, atau nomor WhatsApp
 *
 * return true  → ini pesan pertama (key berhasil dibuat, belum pernah ada sebelumnya)
 * return false → user ini sudah pernah chat sebelumnya, ATAU Upstash belum dikonfigurasi
 */
export async function isFirstMessage(channel, id) {
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    console.warn('⚠️  Upstash belum dikonfigurasi (UPSTASH_REDIS_REST_URL / TOKEN kosong) — fitur pesan perkenalan dinonaktifkan sementara.');
    return false;
  }

  const key = `seen:${channel}:${id}`;
  const url = `${UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(key)}/1/NX`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}` },
    });
    const data = await res.json();
    // Upstash balas { result: "OK" } kalau berhasil di-set (berarti baru/pertama kali),
    // atau { result: null } kalau key sudah ada (berarti sudah pernah chat sebelumnya)
    return data.result === 'OK';
  } catch (err) {
    console.error('❌ Gagal cek status "pesan pertama" ke Upstash:', err.message);
    return false; // kalau gagal, aman-nya anggap bukan pesan pertama (langsung jawab seperti biasa)
  }
}
