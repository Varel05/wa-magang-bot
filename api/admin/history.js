import { requireAdminAuth } from '../../lib/adminAuth.js';
import { getHistory, deleteHistory } from '../../lib/historyStore.js';

export default async function handler(req, res) {
  if (!requireAdminAuth(req, res)) return;

  const { channel, id } = req.query;
  if (!channel || !id) {
    return res.status(400).json({ error: 'Parameter channel dan id wajib diisi.' });
  }

  if (req.method === 'GET') {
    try {
      const history = await getHistory(channel, id);
      return res.status(200).json({ channel, id, history });
    } catch (err) {
      console.error('❌ Error ambil riwayat:', err.message);
      return res.status(500).json({ error: 'Gagal ambil riwayat percakapan.' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await deleteHistory(channel, id);
      console.log(`🗑️  Riwayat ${channel}:${id} dihapus lewat panel admin`);
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('❌ Error hapus riwayat:', err.message);
      return res.status(500).json({ error: 'Gagal hapus riwayat percakapan.' });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
