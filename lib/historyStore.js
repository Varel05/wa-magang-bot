const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = process.env;

// Maksimal berapa PASANG (user+bot) pesan terakhir yang diingat per orang.
// Semakin besar, semakin "ingat banyak" tapi juga semakin mahal (lebih banyak token dikirim ke Gemini tiap request).
const MAX_TURNS = 6; // 6 pasang = 12 pesan terakhir

// Riwayat otomatis "lupa" kalau tidak ada pesan baru selama ini (detik). Default: 2 hari.
const HISTORY_TTL_SECONDS = 60 * 60 * 24 * 2;

/**
 * Kirim command mentah ke Upstash REST API (format: array, mis. ["GET", "key"]).
 * Dipakai daripada endpoint path-style supaya aman untuk value yang mengandung JSON/karakter spesial.
 */
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
 * Ambil riwayat percakapan user ini. Return array kosong kalau belum ada / Upstash belum dikonfigurasi.
 * Format tiap item: { role: "user" | "model", text: string }
 */
export async function getHistory(channel, id) {
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) return [];

  const key = `history:${channel}:${id}`;
  try {
    const raw = await upstashCommand(['GET', key]);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('❌ Gagal ambil riwayat dari Upstash:', err.message);
    return []; // gagal ambil riwayat → anggap saja belum ada riwayat, tetap lanjut jalan
  }
}

/**
 * Tambahkan satu pasang pertukaran (pesan user + balasan bot) ke riwayat, lalu simpan.
 * Otomatis memotong riwayat supaya tidak lebih dari MAX_TURNS pasang terakhir.
 */
export async function appendToHistory(channel, id, userText, modelText) {
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) return;

  const key = `history:${channel}:${id}`;
  try {
    const current = await getHistory(channel, id);
    const updated = [
      ...current,
      { role: 'user', text: userText },
      { role: 'model', text: modelText },
    ].slice(-MAX_TURNS * 2); // simpan cuma N pasang terakhir

    await upstashCommand(['SET', key, JSON.stringify(updated), 'EX', String(HISTORY_TTL_SECONDS)]);
  } catch (err) {
    console.error('❌ Gagal simpan riwayat ke Upstash:', err.message);
    // gagal simpan bukan fatal — percakapan tetap lanjut, cuma riwayatnya tidak ke-update
  }
}
