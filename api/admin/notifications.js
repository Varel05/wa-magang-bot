import { requireAdminAuth } from '../../lib/adminAuth.js';
import { getRecentNotifications } from '../../lib/notifyStore.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!requireAdminAuth(req, res)) return;

  const since = Number(req.query.since) || 0;

  try {
    const notifications = await getRecentNotifications(since);
    return res.status(200).json({ notifications });
  } catch (err) {
    console.error('❌ Error ambil notifikasi:', err.message);
    return res.status(500).json({ error: 'Gagal ambil notifikasi.' });
  }
}
