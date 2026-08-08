# Chatbot FAQ Magang — WhatsApp & Telegram, Deploy ke Vercel (tanpa Langflow)

Satu project, dua channel: **WhatsApp** dan **Telegram**, sama-sama pakai FAQ dan otak AI yang sama
(**Gemini 3.5 Flash-Lite**), dideploy sebagai serverless functions di Vercel.

```
wa-vercel-bot/
├── api/
│   ├── webhook.js        ← endpoint WhatsApp  (https://domain-anda/api/webhook)
│   └── telegram.js       ← endpoint Telegram  (https://domain-anda/api/telegram)
├── lib/
│   ├── askGemini.js       ← pemanggil Gemini API (dipakai kedua channel)
│   ├── telegram.js        ← helper kirim pesan Telegram
│   ├── seenStore.js       ← deteksi "pesan pertama dari user ini" via Upstash Redis
│   └── faq.js             ← FAQ MAGANG + pesan perkenalan + system prompt (dipakai kedua channel)
├── package.json
└── .env.example
```

## 1. Isi FAQ magang

Buka `lib/faq.js`, ganti isi `FAQ_MAGANG` dengan data program magang Anda yang sebenarnya
(syarat, jadwal, dokumen, alur pendaftaran, dll). Semakin lengkap & rapi, semakin akurat jawaban bot.

> Kirimkan FAQ Anda ke saya kapan saja kalau mau saya bantu susun/rapikan ke format ini.

## 2. Dapatkan Gemini API key

1. Buka [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → buat API key baru.
2. Simpan key-nya (dipakai di langkah 4).

## 3. Buat database Upstash Redis (untuk fitur pesan perkenalan)

Bot ini mengirim pesan perkenalan otomatis di chat pertama seseorang, lalu menjawab pertanyaan seperti biasa di pesan berikutnya. Untuk mengingat "siapa saja yang sudah pernah chat", dipakai Upstash Redis (gratis untuk skala FAQ bot).

1. Buka [console.upstash.com](https://console.upstash.com) → **Create Database** (pilih region terdekat, mis. Singapore).
2. Buka tab **REST API** di database yang baru dibuat.
3. Salin nilai `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN` (dipakai di langkah 5).

> Kalau env ini belum diisi, bot tetap jalan normal — cuma fitur perkenalan otomatis nonaktif (langsung jawab pertanyaan seperti biasa).

## 4. Push project ini ke GitHub

```bash
cd wa-vercel-bot
git init
git add .
git commit -m "init wa magang bot"
git branch -M main
git remote add origin <url-repo-github-anda>
git push -u origin main
```

## 5. Deploy ke Vercel

1. Buka [vercel.com](https://vercel.com) → **Add New Project** → import repo GitHub di atas.
2. Sebelum klik Deploy, buka **Environment Variables**, isi:
   - `WHATSAPP_ACCESS_TOKEN`
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_VERIFY_TOKEN` (bebas, buat sendiri)
   - `GEMINI_API_KEY`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_WEBHOOK_SECRET` (bebas, buat sendiri)
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
3. Klik **Deploy**. Setelah selesai, Anda dapat domain permanen, misalnya:
   ```
   https://wa-magang-bot.vercel.app
   ```

## 6. Daftarkan webhook ke Meta

Di dashboard app Meta for Developers → **WhatsApp** → **Configuration** → **Webhook**:
- **Callback URL**: `https://wa-magang-bot.vercel.app/api/webhook`
- **Verify token**: samakan dengan `WHATSAPP_VERIFY_TOKEN` di env Vercel
- **Verify and Save**, lalu subscribe ke field `messages`

Karena domain Vercel ini permanen, langkah ini **hanya perlu dilakukan sekali** — beda dengan ngrok yang berubah tiap restart.

## 7. Daftarkan webhook ke Telegram

### a. Buat bot & ambil token
1. Buka Telegram, chat ke **[@BotFather](https://t.me/BotFather)**.
2. Kirim `/newbot`, ikuti instruksinya (kasih nama & username bot).
3. BotFather akan kasih **token**, formatnya seperti `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`. Ini nilai untuk `TELEGRAM_BOT_TOKEN`.

### b. Set webhook (setelah project sudah dideploy ke Vercel)
Jalankan perintah ini sekali saja (ganti `<TOKEN>`, `<DOMAIN>`, dan `<SECRET>` sesuai punya Anda — `<SECRET>` harus sama persis dengan `TELEGRAM_WEBHOOK_SECRET` di env Vercel):

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<DOMAIN>/api/telegram",
    "secret_token": "<SECRET>"
  }'
```

Contoh nyata:
```bash
curl -X POST "https://api.telegram.org/bot123456789:AAExxxx/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://wa-magang-bot.vercel.app/api/telegram", "secret_token": "magangbot_telegram_secret123"}'
```

Kalau berhasil, responnya: `{"ok":true,"result":true,"description":"Webhook was set"}`.

### c. Test
Cari bot Anda di Telegram (pakai username yang dibuat di BotFather), kirim pesan apa saja. Cek log realtime di **Vercel Dashboard → project Anda → tab "Logs"**.

## 8. Test WhatsApp

Kirim WhatsApp dari nomor test yang sudah diverifikasi di dashboard Meta. Cek log realtime di:
**Vercel Dashboard → project Anda → tab "Logs"**.

## 9. Batasan versi ini (dan cara upgrade-nya nanti)

- **Tidak ada memory percakapan** (Gemini tidak mengingat isi chat sebelumnya, hanya status "sudah pernah chat atau belum" yang diingat lewat Upstash). Kalau butuh Gemini mengingat riwayat obrolan penuh, beri tahu saya, saya bantu tambahkan.
- **Reset status "sudah pernah chat"**: kalau mau seseorang dapat pesan perkenalan lagi (misal untuk testing), hapus key `seen:whatsapp:<nomor>` atau `seen:telegram:<chatId>` di Upstash console (tab Data Browser).
- **Token WhatsApp temporary** (kalau masih pakai token 24 jam dari testing) akan expired — untuk pemakaian tetap, buat **permanent token** via System User di Meta Business Suite.
- Model AI yang dipakai (`gemini-3.5-flash-lite`) dipilih karena cepat & murah, cocok untuk FAQ bervolume tinggi. Kalau butuh jawaban yang lebih "pintar" untuk pertanyaan kompleks, bisa ganti model di `lib/askGemini.js` (misalnya ke `gemini-3.6-flash`).
