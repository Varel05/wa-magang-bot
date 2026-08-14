import { requireAdminAuth } from '../../lib/adminAuth.js';
import { setContactName } from '../../lib/contactStore.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!requireAdminAuth(req, res)) return;

  const { channel, id, name } = req.body || {};
  if (!channel || !id) {
    return res.status(400).json({ error: 'Parameter channel dan id wajib diisi.' });
  }

  try {
    await setContactName(channel, id, name);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Error simpan nama kontak:', err.message);
    return res.status(500).json({ error: 'Gagal simpan nama kontak.' });
  }
}
