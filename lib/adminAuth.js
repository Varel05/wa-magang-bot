/**
 * Cek header X-Admin-Password terhadap env var ADMIN_PASSWORD.
 * Dipakai di semua endpoint /api/admin/*.
 * Return true kalau valid, atau langsung kirim response 401 & return false kalau tidak.
 */
export function requireAdminAuth(req, res) {
  const { ADMIN_PASSWORD } = process.env;

  if (!ADMIN_PASSWORD) {
    res.status(500).json({ error: 'ADMIN_PASSWORD belum diatur di environment variables Vercel.' });
    return false;
  }

  const provided = req.headers['x-admin-password'];
  if (provided !== ADMIN_PASSWORD) {
    res.status(401).json({ error: 'Password salah atau belum login.' });
    return false;
  }

  return true;
}
