const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = process.env;

const FAQ_KEY = 'faq:content';

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
 * Ambil FAQ custom dari Redis. Return null kalau belum pernah diedit / Upstash belum dikonfigurasi
 * (pemanggilnya lalu fallback ke DEFAULT_FAQ_MAGANG).
 */
export async function getFaqContent() {
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) return null;
  try {
    return await upstashCommand(['GET', FAQ_KEY]);
  } catch (err) {
    console.error('❌ Gagal ambil FAQ dari Upstash:', err.message);
    return null;
  }
}

/**
 * Simpan FAQ baru ke Redis (dipanggil dari halaman /admin).
 */
export async function setFaqContent(text) {
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    throw new Error('Upstash belum dikonfigurasi (UPSTASH_REDIS_REST_URL/TOKEN kosong)');
  }
  await upstashCommand(['SET', FAQ_KEY, text]);
}
