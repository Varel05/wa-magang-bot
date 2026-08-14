# Chatbot FAQ Magang — WhatsApp & Telegram, Deploy ke Vercel (tanpa Langflow)

Satu project, dua channel: **WhatsApp** dan **Telegram**, sama-sama pakai FAQ dan otak AI yang sama
(**Gemini 3.5 Flash-Lite**), dideploy sebagai serverless functions di Vercel.

```
wa-vercel-bot/
├── api/
│   ├── webhook.js         ← endpoint WhatsApp  (https://domain-anda/api/webhook)
│   ├── telegram.js        ← endpoint Telegram  (https://domain-anda/api/telegram)
│   └── admin/
│       ├── users.js       ← API: daftar percakapan + nama kontak (dipakai halaman /admin)
│       ├── history.js     ← API: riwayat satu percakapan
│       ├── contact.js     ← API: simpan/ubah nama panggilan kontak
│       └── faq.js         ← API: baca & simpan FAQ custom
├── lib/
│   ├── askGemini.js       ← pemanggil Gemini API (dipakai kedua channel)
│   ├── telegram.js        ← helper kirim pesan Telegram
│   ├── seenStore.js       ← deteksi "pesan pertama dari user ini" via Upstash Redis
│   ├── historyStore.js    ← simpan, ambil, & list riwayat percakapan via Upstash Redis
│   ├── faqStore.js        ← simpan & ambil FAQ custom via Upstash Redis
│   ├── contactStore.js    ← simpan & ambil nama panggilan kontak via Upstash Redis
│   ├── adminAuth.js       ← cek password admin di tiap request /api/admin/*
│   └── faq.js             ← FAQ default + pesan perkenalan + system prompt builder
├── public/
│   └── admin/
│       └── index.html     ← halaman UI admin (https://domain-anda/admin)
├── package.json
└── .env.example
```

## 1. Isi FAQ magang (versi awal/default)

Buka `lib/faq.js`, ganti isi `DEFAULT_FAQ_MAGANG` dengan data program magang Anda yang sebenarnya
(syarat, jadwal, dokumen, alur pendaftaran, dll). Ini FAQ default yang dipakai selama belum pernah diedit lewat halaman **/admin**.

Setelah project live, Anda tidak perlu edit file ini lagi untuk update FAQ sehari-hari — cukup lewat halaman `/admin` (lihat langkah 6), perubahan langsung berlaku tanpa deploy ulang.

## 2. Dapatkan Gemini API key

1. Buka [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → buat API key baru.
2. Simpan key-nya (dipakai di langkah 4).

## 3. Buat database Upstash Redis (untuk pesan perkenalan & riwayat percakapan)

Upstash Redis dipakai untuk dua hal: (1) mengingat "siapa saja yang sudah pernah chat" (fitur pesan perkenalan), dan (2) menyimpan riwayat percakapan tiap orang, supaya Gemini mengingat obrolan sebelumnya (bukan menjawab tiap pesan seperti orang baru terus). Gratis untuk skala FAQ bot.

> Catatan: "Vercel KV" sudah tidak ada sejak akhir 2024 — Vercel memindahkan semua penggunanya ke Upstash Redis. Jadi Upstash Redis inilah penggantinya, bukan layanan terpisah.

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
   - `ADMIN_PASSWORD` (bebas, buat password kuat — ini kunci masuk ke halaman /admin)
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

## 9. Pakai panel admin (riwayat pesan & edit FAQ)

Buka `https://wa-magang-bot.vercel.app/admin` di browser. Masukkan password yang sama dengan `ADMIN_PASSWORD` di env Vercel.

**Tab "Riwayat Pesan"**: daftar semua orang yang pernah chat (WhatsApp & Telegram jadi satu daftar), klik salah satu untuk lihat isi percakapannya. Klik ikon ✏️ di sebelah nomor/ID untuk kasih nama panggilan (mis. "Budi - UGM") supaya lebih gampang dikenali daripada nomor mentah — nama ini cuma untuk Anda di panel admin, tidak memengaruhi cara bot membalas.

**Tab "Edit FAQ"**: isi FAQ yang sedang aktif ditampilkan di textarea. Edit lalu klik **Simpan perubahan** — bot langsung memakai versi baru di chat berikutnya, tanpa perlu redeploy.

> ⚠️ Halaman ini menampilkan data pribadi (nomor WA/isi chat calon pemagang). Jaga `ADMIN_PASSWORD` tetap rahasia, jangan dibagikan sembarangan.

## 10. Batasan versi ini (dan cara upgrade-nya nanti)

- **Riwayat percakapan**: disimpan otomatis, maksimal 6 pasang pesan terakhir per orang (bisa diubah di `MAX_TURNS` pada `lib/historyStore.js`), dan otomatis "lupa" kalau tidak ada pesan baru selama 2 hari (`HISTORY_TTL_SECONDS`). Semakin besar MAX_TURNS, semakin "ingat banyak" tapi juga semakin banyak token yang dikirim ke Gemini tiap request (lebih mahal & sedikit lebih lambat).
- **Status "mengetik" di WhatsApp**: aktif otomatis, durasi = jumlah kata balasan ÷ 5 detik (diatur di `TYPING_WORDS_PER_SECOND`, `api/webhook.js`), dibatasi maksimal 8 detik (`MAX_TYPING_DELAY_SECONDS`) supaya aman dari timeout function. Kalau plan Vercel Anda mendukung durasi function lebih lama, boleh dinaikkan bareng nilai `maxDuration` di file yang sama. **Vercel Hobby plan default membatasi function maksimal beberapa detik saja** — kalau `maxDuration: 30` di kode ditolak/di-cap saat deploy, itu tandanya perlu upgrade plan atau turunkan nilainya.
- **Reset riwayat/status seseorang** (misal untuk testing ulang dari nol): hapus key `seen:whatsapp:<nomor>`, `history:whatsapp:<nomor>` (atau versi `telegram:<chatId>`-nya) di Upstash console (tab Data Browser).
- **Token WhatsApp temporary** (kalau masih pakai token 24 jam dari testing) akan expired — untuk pemakaian tetap, buat **permanent token** via System User di Meta Business Suite.
- **Password admin sederhana**: proteksi `/admin` cuma satu password bersama (bukan sistem login per-user). Cukup untuk 1 admin, tapi kalau nanti perlu multi-admin dengan akses berbeda, beri tahu saya, bisa ditingkatkan.
- Model AI yang dipakai (`gemini-3.5-flash-lite`) dipilih karena cepat & murah, cocok untuk FAQ bervolume tinggi. Kalau butuh jawaban yang lebih "pintar" untuk pertanyaan kompleks, bisa ganti model di `lib/askGemini.js` (misalnya ke `gemini-3.6-flash`).
