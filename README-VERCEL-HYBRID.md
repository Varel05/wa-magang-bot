# Mode Hybrid: Domain Tetap di Vercel + WAHA Lokal (via Tailscale Funnel)

Kalau kamu mau tetap pakai domain Vercel (`https://wa-magang-bot.vercel.app`) untuk webhook, panel
admin `/admin`, dan Telegram — tapi channel WhatsApp-nya lewat WAHA yang jalan di rumah — ini caranya.

**Tidak ada satu baris kode pun yang perlu diubah.** `lib/waha.js` sudah dibuat env-driven
(`WAHA_BASE_URL`), jadi kode yang sama persis dipakai baik untuk mode full-lokal maupun mode ini.
Yang beda cuma *ke mana* `WAHA_BASE_URL` menunjuk, dan *di mana* masing-masing bagian di-deploy.

## Kenapa butuh Tailscale Funnel (bukan cuma `serve`)

Ada 2 arah komunikasi:

1. **WAHA (rumah) → Vercel** — waktu ada pesan WhatsApp masuk, WAHA manggil keluar ke webhook
   Vercel kamu. Ini gampang, karena Vercel memang sudah publik. **Tidak perlu Funnel.**
2. **Vercel → WAHA (rumah)** — waktu bot mau balas/kirim status "mengetik", function di Vercel
   harus bisa manggil WAHA yang ada di rumah kamu. Vercel **bukan** anggota tailnet kamu, jadi
   `tailscale serve` (yang cuma bisa diakses sesama device tailnet) **tidak cukup**. Perlu
   **`tailscale funnel`**, yang mempublish port itu ke internet lewat HTTPS — WAHA jadi bisa
   diakses dari mana saja, termasuk dari server Vercel, tapi tetap dilindungi `WAHA_API_KEY`.

**Konsekuensinya**: WAHA kamu jadi punya endpoint publik di internet. Aman selama `WAHA_API_KEY`
kuat dan dirahasiakan — tapi tetap beda risikonya dibanding mode full-lokal yang cuma bisa diakses
dari tailnet sendiri. Kalau ini terasa kurang nyaman, pola alternatif yang lebih ketat: pakai
Vercel cuma untuk Telegram + panel admin, dan WhatsApp tetap full-lokal (lihat `README-WAHA.md`).

**Juga penting**: karena kirim-balasan WhatsApp lewat WAHA di rumah, bot cuma bisa membalas
WhatsApp kalau komputer/Docker di rumah **dan** Tailscale Funnel-nya sedang nyala. Kalau internet
rumah mati, WhatsApp tidak akan terjawab meskipun domain Vercel-nya tetap online (Telegram & panel
admin tetap normal karena tidak bergantung ke WAHA).

## 1. Aktifkan Funnel di tailnet kamu

Buka [Tailscale Admin Console → Access Controls](https://login.tailscale.com/admin/acls), tambahkan
(atau pastikan sudah ada) blok `nodeAttrs` ini di kebijakan (policy file):

```json
"nodeAttrs": [
  {
    "target": ["autogroup:member"],
    "attr":   ["funnel"]
  }
]
```

Simpan. Pastikan juga **HTTPS Certificates** aktif (Admin Console → DNS → Enable HTTPS).

## 2. Siapkan `.env` untuk service WAHA lokal

```bash
cp .env.example .env
```

Isi bagian yang relevan untuk mode ini:
- `WAHA_API_KEY` — **wajib** kuat, karena WAHA kamu akan publik di internet.
- `WAHA_WEBHOOK_SECRET` — sama seperti sebelumnya.
- `TS_AUTHKEY` — dari Tailscale Admin Console (Reusable disarankan).
- `VERCEL_APP_URL` — domain Vercel kamu, **tanpa trailing slash**, mis. `https://wa-magang-bot.vercel.app`.

(Variabel lain seperti `GEMINI_API_KEY`, `UPSTASH_*`, dst tidak dipakai di file `.env` ini karena
itu semua jalan di sisi Vercel — isi di Environment Variables Vercel, bukan di sini.)

## 3. Jalankan WAHA + Tailscale lokal

```bash
docker compose -f docker-compose.vercel-hybrid.yml up -d
```

Scan QR seperti biasa (lihat langkah 4 di `README-WAHA.md` — caranya sama):
```bash
docker compose -f docker-compose.vercel-hybrid.yml logs -f waha
# atau buka http://localhost:3000/dashboard dari komputer ini
```

## 4. Aktifkan Funnel untuk port WAHA (3000)

```bash
docker compose -f docker-compose.vercel-hybrid.yml exec tailscale tailscale funnel --bg 3000
```

Cek domain publiknya:
```bash
docker compose -f docker-compose.vercel-hybrid.yml exec tailscale tailscale funnel status
```

Hasilnya domain seperti `https://magangjogja-waha.<nama-tailnet-kamu>.ts.net` — port Funnel akan
otomatis 443 (HTTPS), diteruskan ke port 3000 WAHA di dalam container.

## 5. Set Environment Variables di Vercel

Di **Vercel Dashboard → Project → Settings → Environment Variables**, isi (ganti dari env Meta yang lama):

| Variabel | Nilai |
|---|---|
| `WAHA_BASE_URL` | `https://magangjogja-waha.<tailnet-kamu>.ts.net` (dari langkah 4, **tanpa** `:3000`) |
| `WAHA_API_KEY` | sama persis dengan yang di `.env` lokal |
| `WAHA_WEBHOOK_SECRET` | sama persis dengan yang di `.env` lokal |
| `WAHA_SESSION` | `default` (opsional, itu memang default-nya) |
| `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `ADMIN_PASSWORD` | seperti biasa, tidak berubah |

Hapus variabel lama: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`
(sudah tidak dipakai sama sekali oleh `api/webhook.js` versi baru).

Redeploy project (**Deployments → ⋯ → Redeploy**, atau push commit baru — file `api/webhook.js` dan
`lib/waha.js` yang baru harus ikut ter-deploy).

## 6. Test end-to-end

- Kirim WhatsApp ke nomor bot → cek log: `docker compose -f docker-compose.vercel-hybrid.yml logs -f waha` (harus kelihatan event masuk & WAHA manggil `WHATSAPP_HOOK_URL`) dan **Vercel → Logs** (harus kelihatan request masuk ke `/api/webhook`, lalu WAHA manggil balik ke `/api/sendText` dst).
- Kalau balasan tidak sampai: cek dulu apakah `tailscale funnel status` masih aktif (Funnel bisa mati kalau container `tailscale` restart tanpa auto-resume — kalau begitu, jalankan ulang perintah di langkah 4).

## 7. Auto-resume Funnel setelah restart

`tailscale funnel --bg` disimpan di state Tailscale (volume `tailscale_state`), jadi biasanya
otomatis aktif lagi setelah container/komputer restart. Kalau ternyata tidak (cek dengan
`tailscale funnel status`), tambahkan lagi baris `tailscale funnel --bg 3000` ke script startup kamu,
atau jalankan manual sekali setelah restart.

## Ringkasan siapa hosting apa

| Bagian | Lokasi |
|---|---|
| `/api/webhook`, `/api/telegram`, `/api/admin/*`, panel admin `/admin` | **Vercel** (tidak berubah dari setup awal, kecuali `api/webhook.js` sekarang manggil WAHA bukan Meta) |
| WAHA (koneksi WhatsApp asli, scan QR) | **Docker lokal di rumah** |
| Redis (history, FAQ, notifikasi) | **Upstash** (tidak berubah) |
| Jembatan Vercel ↔ WAHA lokal | **Tailscale Funnel** |

`server.js` dan `docker-compose.yml` (yang full-lokal) tidak dipakai di mode ini — biarkan saja ada
di repo sebagai opsi kalau nanti mau pindah ke full-lokal.
