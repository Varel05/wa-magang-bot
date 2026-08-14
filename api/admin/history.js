import { requireAdminAuth } from '../../lib/adminAuth.js';
import { getHistory } from '../../lib/historyStore.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!requireAdminAuth(req, res)) return;

  const { channel, id } = req.query;
  if (!channel || !id) {
    return res.status(400).json({ error: 'Parameter channel dan id wajib diisi.' });
  }

  try {
    const history = await getHistory(channel, id);
    return res.status(200).json({ channel, id, history });
  } catch (err) {
    console.error('❌ Error ambil riwayat:', err.message);
    return res.status(500).json({ error: 'Gagal ambil riwayat percakapan.' });
  }
}
