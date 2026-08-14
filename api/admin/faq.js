import { requireAdminAuth } from '../../lib/adminAuth.js';
import { getFaqContent, setFaqContent } from '../../lib/faqStore.js';
import { DEFAULT_FAQ_MAGANG } from '../../lib/faq.js';

export default async function handler(req, res) {
  if (!requireAdminAuth(req, res)) return;

  if (req.method === 'GET') {
    try {
      const custom = await getFaqContent();
      return res.status(200).json({
        content: custom || DEFAULT_FAQ_MAGANG,
        isCustom: Boolean(custom),
      });
    } catch (err) {
      console.error('❌ Error ambil FAQ:', err.message);
      return res.status(500).json({ error: 'Gagal ambil FAQ.' });
    }
  }

  if (req.method === 'POST') {
    const { content } = req.body || {};
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Isi FAQ tidak boleh kosong.' });
    }

    try {
      await setFaqContent(content);
      console.log('📝 FAQ diperbarui lewat halaman admin');
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('❌ Error simpan FAQ:', err.message);
      return res.status(500).json({ error: 'Gagal simpan FAQ. Pastikan Upstash Redis sudah dikonfigurasi.' });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
