# Chatbot WhatsApp — FAQ Magang

Bot ini menjembatani WhatsApp dengan flow AI yang sudah Anda buat di **Langflow**.
Alur kerja: `Pesan WhatsApp masuk → dikirim ke Langflow → jawaban AI dikirim balik ke WhatsApp`.

## 1. Persiapan

### a. Jalankan Langflow dan catat info flow Anda
1. Pastikan Langflow jalan (biasanya di `http://localhost:7860`).
2. Buka flow yang sudah Anda buat, klik **API** di pojok kanan atas untuk melihat contoh request.
3. Catat:
   - **Flow ID** (ada di URL request, formatnya UUID panjang)
   - **API Key** (jika Anda mengaktifkan autentikasi di Langflow; kalau tidak, boleh dikosongkan)

### b. Install dependencies
```bash
npm install
```

### c. Konfigurasi
```bash
cp .env.example .env
```
Lalu edit `.env`, isi:
```
LANGFLOW_API_URL=http://localhost:7860/api/v1/run/FLOW_ID_ANDA
LANGFLOW_API_KEY=isi_jika_ada
```

## 2. Jalankan bot
```bash
npm start
```
- Akan muncul **QR code** di terminal.
- Buka WhatsApp di HP → **Perangkat Tertaut** → **Tautkan Perangkat** → scan QR tersebut.
- Setelah terhubung, akan muncul log `✅ Bot WhatsApp terhubung`.

Sesi login tersimpan di folder `auth_session/`, jadi tidak perlu scan ulang setiap kali restart (selama tidak logout dari HP).

## 3. Cara kerja

- Bot **hanya merespons chat pribadi** (grup diabaikan) — ini standar untuk bot layanan FAQ.
- Setiap nomor WhatsApp pengirim dipakai sebagai `session_id` ke Langflow, supaya Langflow bisa mengingat konteks per-orang (kalau flow Anda menggunakan memory/session).
- Kalau Langflow error atau timeout, bot mengirim pesan fallback otomatis, tidak crash.

## 4. Memasukkan data FAQ magang ke Langflow

Karena logika AI ada di Langflow, cara terbaik memasukkan FAQ (syarat, jadwal, dokumen, dll) adalah **di dalam flow itu sendiri**, misalnya:
- Ditempel sebagai teks di komponen **Prompt/System Message**, atau
- Diunggah sebagai dokumen ke komponen **Vector Store / File** kalau Anda pakai pendekatan RAG.

Silakan kirimkan daftar FAQ Anda (boleh teks langsung, atau upload file) — saya bisa bantu:
1. Merapikannya jadi format yang enak dipakai di system prompt Langflow, ATAU
2. Menyusunnya jadi dokumen (misalnya `.txt`/`.csv`) siap upload ke vector store.

## 5. Menyesuaikan format respons Langflow

Struktur JSON respons Langflow bisa sedikit berbeda tergantung komponen output di flow Anda.
`index.js` sudah mencoba beberapa path umum. Kalau balasan bot muncul sebagai pesan fallback terus:
1. Jalankan bot, kirim 1 pesan test.
2. Lihat log di terminal — akan tercetak JSON lengkap dari Langflow.
3. Kirimkan JSON tersebut ke saya, nanti saya sesuaikan path pengambilan teksnya di `askLangflow()`.

## 6. Catatan penting

- Bot ini pakai **Baileys** (library tidak resmi, seperti WhatsApp Web) — cocok untuk prototype/skala kecil tanpa perlu verifikasi Meta Business.
- Untuk pemakaian resmi/skala besar ke depan, bisa migrasi ke **WhatsApp Cloud API** resmi dari Meta — beri tahu saya kalau sudah siap, saya bantu adaptasi kodenya.
