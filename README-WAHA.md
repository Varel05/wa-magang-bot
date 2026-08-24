# Migrasi ke WAHA (self-hosted) + Hosting Lokal via Docker & Tailscale

Dokumen ini khusus untuk versi **lokal**: WhatsApp tidak lagi lewat Meta Cloud API (App Meta-nya
disabled), tapi lewat **WAHA** (WhatsApp HTTP API self-hosted, login pakai scan QR seperti WhatsApp
Web biasa). Semua jalan di komputer/server kamu sendiri lewat Docker, dan **Tailscale** dipakai
supaya panel admin & dashboard WAHA bisa diakses dari HP/laptop lain tanpa buka port ke internet.

Bot Telegram & panel admin **tidak berubah logikanya sama sekali** — cuma channel WhatsApp-nya yang
diganti "otaknya".

## Apa yang berubah dari versi Vercel

| | Versi lama (Vercel) | Versi ini (Docker lokal) |
|---|---|---|
| Kirim/terima WhatsApp | WhatsApp Cloud API (Meta), App Meta wajib aktif | WAHA (self-hosted, login via QR, tidak butuh App Meta) |
| Hosting | Serverless functions di Vercel | Container Docker di komputer/server kamu |
| Akses dari luar | Domain publik `*.vercel.app` | Tailscale (jaringan privat kamu sendiri) |
| Redis (history, FAQ, dst) | Upstash Redis | **Tetap Upstash Redis** (tidak diganti, sudah cukup ringan & gratis) |
| Telegram | Webhook ke Vercel | Webhook ke domain Tailscale kamu |

`server.js` (baru) menjalankan seluruh `api/*.js` yang sama lewat Express biasa — kodenya kompatibel
langsung karena awalnya sudah pakai gaya `(req, res)`.

## 1. Prasyarat

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/Mac) atau Docker Engine + Compose plugin (Linux) sudah terinstall.
- Akun [Tailscale](https://tailscale.com) (gratis untuk pemakaian personal).
- Nomor WhatsApp yang mau dijadikan bot, di HP-nya, siap untuk di-scan QR (fungsinya kaya WhatsApp Web/Multi-device — nomor itu tetap bisa dipakai normal di HP).

## 2. Siapkan `.env`

```bash
cd wa-magang-bot
cp .env.example .env
```

Isi semua variabel di `.env`:
- `WAHA_API_KEY`, `WAHA_WEBHOOK_SECRET` — bebas, buat string acak (mis. `openssl rand -hex 24`).
- `TS_AUTHKEY` — dari [Tailscale Admin → Settings → Keys](https://login.tailscale.com/admin/settings/keys), generate auth key baru (centang **Reusable**, biar tidak perlu bikin baru tiap kali container dihidupkan ulang).
- `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `ADMIN_PASSWORD` — sama seperti sebelumnya di README utama.

## 3. Build & jalankan

```bash
docker compose up -d --build
```

Ini menyalakan 3 container: `waha`, `bot`, `tailscale`. Cek statusnya:

```bash
docker compose ps
docker compose logs -f waha
```

## 4. Scan QR WhatsApp (sekali saja, kecuali logout)

WAHA otomatis membuat session bernama `default` dan menunggu login. Dua cara lihat QR-nya:

**Cara A — Dashboard (paling gampang):**
Buka `http://localhost:3000/dashboard` di browser (di komputer yang sama dengan Docker-nya) →
masukkan `WAHA_API_KEY` dari `.env` → klik session `default` → scan QR dengan HP:
**WhatsApp → Perangkat Tertaut → Tautkan Perangkat**.

**Cara B — Lewat log terminal** (kalau tidak mau buka dashboard):
```bash
docker compose logs -f waha
```
QR-nya dicetak sebagai ASCII di log (karena `WAHA_PRINT_QR=true`).

Setelah discan, cek statusnya jadi `WORKING`:
```bash
curl http://localhost:3000/api/sessions/default -H "X-Api-Key: <isi WAHA_API_KEY dari .env>"
```

Session tersimpan permanen di Docker volume `waha_sessions` — **tidak perlu scan ulang** tiap kali
container di-restart, kecuali kamu logout manual dari HP atau volume-nya dihapus.

## 5. Webhook & Telegram — sudah otomatis

- **WhatsApp**: webhook WAHA → bot sudah otomatis lewat env `WHATSAPP_HOOK_URL` di `docker-compose.yml` (`http://bot:3080/api/webhook`, lewat network internal Docker). Tidak ada langkah manual seperti daftar Callback URL ke Meta.
- **Telegram**: karena sekarang tidak ada domain publik permanen dari Vercel, daftarkan webhook Telegram ke domain Tailscale kamu (lihat langkah 6 di bawah dulu untuk dapat domainnya), baru jalankan:
  ```bash
  curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
    -H "Content-Type: application/json" \
    -d '{"url": "https://<domain-tailscale-kamu>/api/telegram", "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"}'
  ```

## 6. Ekspos ke Tailscale (biar bisa akses dari HP/laptop lain)

Container `tailscale` otomatis `tailscale up` pakai `TS_AUTHKEY` saat pertama nyala. Setelah itu,
publish panel admin (dan webhook Telegram) lewat HTTPS di tailnet kamu:

```bash
docker compose exec tailscale tailscale serve --bg 3080
```

Cek domain yang di-generate:
```bash
docker compose exec tailscale tailscale status
docker compose exec tailscale tailscale serve status
```

Hasilnya berupa domain seperti `https://magangjogja-bot.<nama-tailnet-kamu>.ts.net` — itulah
`<domain-tailscale-kamu>` yang dipakai di langkah 5. Domain ini **hanya bisa diakses oleh device
yang sudah join tailnet kamu** (HP kamu, laptop lain, dst — install app Tailscale di situ & login
dengan akun yang sama), jadi aman tanpa perlu buka port router ke internet publik.

Kalau mau expose dashboard WAHA juga (opsional, biar bisa cek status WhatsApp dari HP):
```bash
docker compose exec tailscale tailscale serve --bg --set-path=/waha 3000
```

## 7. Test

- WhatsApp: kirim pesan dari HP lain ke nomor bot. Lihat log: `docker compose logs -f bot`.
- Telegram: chat ke bot Telegram kamu seperti biasa.
- Panel admin: buka `https://<domain-tailscale-kamu>/admin` (dari device manapun di tailnet) atau `http://localhost:3080/admin` (dari komputer Docker-nya sendiri).

## 8. Batasan & catatan penting

- **WAHA Core (gratis) cuma 1 session** — cukup untuk 1 nomor WhatsApp bot, sesuai kebutuhan project ini. Kalau nanti butuh banyak nomor sekaligus, ada tier WAHA Plus (berbayar).
- **Media (gambar/dokumen)**: bot ini dari awal memang cuma menjawab pesan teks (`if (!text) ...` di `api/webhook.js`), jadi tidak terdampak keterbatasan media di tier gratis WAHA.
- **Uptime**: karena hosting-nya di komputer/server kamu sendiri (bukan cloud), bot cuma online selama komputer & Docker-nya nyala. Kalau butuh online 24/7, jalankan di device yang memang menyala terus (mini PC, NAS, atau VPS kecil — compose ini portable ke server manapun yang punya Docker).
- **Backup session WhatsApp**: volume `waha_sessions` isinya kredensial login WhatsApp — kalau volume ini hilang, harus scan QR ulang. Backup berkala kalau perlu:
  ```bash
  docker run --rm -v wa-magang-bot_waha_sessions:/data -v "$PWD":/backup alpine tar czf /backup/waha_sessions_backup.tar.gz -C /data .
  ```
- **Restart semua service**: `docker compose restart`. **Update image**: `docker compose pull && docker compose up -d`.
- Kode lama (`api/webhook.js` versi Meta Cloud API) disimpan sebagai referensi di `legacy-meta/webhook-meta-cloud-api.js.txt`, tidak dipakai lagi.
