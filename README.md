# Integrasi WhatsApp dan Langflow di Vercel

Folder ini berisi *source code* backend FastAPI untuk menghubungkan WhatsApp Webhook ke API Langflow Anda.

## Struktur File
- `api/index.py` : Kode utama server (menerima dari WA -> lempar ke Langflow -> balas ke WA).
- `vercel.json`  : Konfigurasi wajib agar Vercel membaca Python (FastAPI).
- `requirements.txt` : *Library* yang digunakan.

(Silakan ikuti instruksi yang diberikan oleh AI di layar obrolan untuk langkah-langkah *deploy*).
