const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = process.env;

// Maksimal berapa PASANG (user+bot) pesan terakhir yang DISIMPAN di database per orang.
// Ini cuma jaga-jaga supaya 1 kontak tidak membengkak tak terkendali — riwayat sekarang
// tidak lagi auto-expire, jadi angka ini yang jadi batas atas ukuran per kontak.
const MAX_STORED_TURNS = 100; // 100 pasang = 200 pesan tersimpan

// Maksimal berapa PASANG pesan TERAKHIR yang dikirim sebagai konteks ke Gemini tiap request.
// Dipisah dari batas penyimpanan di atas: riwayat lengkap (sampai MAX_STORED_TURNS) tetap
// tersimpan & bisa dilihat/diunduh lewat /admin, tapi yang dikirim ke Gemini cuma N pasang
// terakhir supaya token per-request tetap murah & cepat walau riwayat sudah panjang.
export const MAX_CONTEXT_TURNS = 6; // 6 pasang = 12 pesan dikirim ke Gemini

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
 * Ambil riwayat percakapan LENGKAP user ini (sampai MAX_STORED_TURNS pasang terakhir).
 * Return array kosong kalau belum ada / Upstash belum dikonfigurasi.
 * Format tiap item: { role: "user" | "model", text: string }
 * Dipakai untuk tampilan/unduh riwayat di /admin. Untuk konteks yang dikirim ke Gemini,
 * pakai getRecentContext() supaya token tidak membengkak.
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
 * Potong riwayat lengkap jadi N pasang terakhir saja — dipakai sebelum mengirim konteks
 * ke Gemini supaya token per-request tetap hemat meski riwayat yang tersimpan sudah panjang.
 */
export function getRecentContext(history, maxTurns = MAX_CONTEXT_TURNS) {
  if (!Array.isArray(history) || !history.length) return [];
  return history.slice(-maxTurns * 2);
}

/**
 * List semua percakapan yang tersimpan (dipakai halaman /admin untuk menampilkan daftar user).
 * Return array of { channel, id }.
 */
export async function listConversations() {
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) return [];

  const keys = [];
  let cursor = '0';

  try {
    do {
      const result = await upstashCommand(['SCAN', cursor, 'MATCH', 'history:*', 'COUNT', '200']);
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');
  } catch (err) {
    console.error('❌ Gagal scan daftar percakapan dari Upstash:', err.message);
    return [];
  }

  return keys
    .map((key) => {
      // format key: history:<channel>:<id>
      const [, channel, ...idParts] = key.split(':');
      return { channel, id: idParts.join(':') };
    })
    .filter((c) => c.channel && c.id);
}
/**
 * Hapus seluruh riwayat percakapan satu kontak dari database (dipakai tombol "Hapus Riwayat" di /admin).
 * Berguna untuk mengurangi beban/ukuran database Upstash. Return true kalau berhasil dihapus.
 */
export async function deleteHistory(channel, id) {
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) return false;

  const key = `history:${channel}:${id}`;
  try {
    await upstashCommand(['DEL', key]);
    return true;
  } catch (err) {
    console.error('❌ Gagal hapus riwayat dari Upstash:', err.message);
    throw err;
  }
}

/**
 * Tambahkan satu pasang pertukaran (pesan user + balasan bot) ke riwayat, lalu simpan.
 * Otomatis memotong riwayat supaya tidak lebih dari MAX_STORED_TURNS pasang terakhir.
 * Riwayat TIDAK auto-expire lagi — hanya hilang kalau dihapus manual lewat /admin atau
 * kalau sudah melebihi MAX_STORED_TURNS (pasangan paling lama otomatis terbuang).
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
    ].slice(-MAX_STORED_TURNS * 2); // simpan cuma N pasang terakhir

    await upstashCommand(['SET', key, JSON.stringify(updated)]);
  } catch (err) {
    console.error('❌ Gagal simpan riwayat ke Upstash:', err.message);
    // gagal simpan bukan fatal — percakapan tetap lanjut, cuma riwayatnya tidak ke-update
  }
}
