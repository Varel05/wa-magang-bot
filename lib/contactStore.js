const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = process.env;

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
 * Simpan/ubah nama panggilan untuk satu kontak. Kirim name kosong/null untuk menghapus nama
 * (kembali ke tampilan nomor/ID mentah).
 */
export async function setContactName(channel, id, name) {
  if (!configured()) {
    throw new Error('Upstash belum dikonfigurasi (UPSTASH_REDIS_REST_URL/TOKEN kosong)');
  }
  const key = `contact:${channel}:${id}`;
  const trimmed = (name || '').trim();

  if (!trimmed) {
    await upstashCommand(['DEL', key]);
  } else {
    await upstashCommand(['SET', key, trimmed]);
  }
}

/**
 * Ambil nama panggilan untuk beberapa kontak sekaligus (efisien, 1 request Redis).
 * @param {{channel: string, id: string}[]} contacts
 * @returns {Promise<Record<string, string>>} map "channel:id" -> nama (cuma yang punya nama)
 */
export async function getContactNames(contacts) {
  if (!configured() || !contacts.length) return {};

  const keys = contacts.map((c) => `contact:${c.channel}:${c.id}`);
  try {
    const values = await upstashCommand(['MGET', ...keys]);
    const map = {};
    contacts.forEach((c, i) => {
      if (values[i]) map[`${c.channel}:${c.id}`] = values[i];
    });
    return map;
  } catch (err) {
    console.error('❌ Gagal ambil nama kontak dari Upstash:', err.message);
    return {};
  }
}
