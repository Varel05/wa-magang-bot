import { requireAdminAuth } from '../../lib/adminAuth.js';
import { listConversations } from '../../lib/historyStore.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!requireAdminAuth(req, res)) return;

  try {
    const conversations = await listConversations();
    return res.status(200).json({ conversations });
  } catch (err) {
    console.error('❌ Error ambil daftar percakapan:', err.message);
    return res.status(500).json({ error: 'Gagal ambil daftar percakapan.' });
  }
}
