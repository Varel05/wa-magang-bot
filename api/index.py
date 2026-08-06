from fastapi import FastAPI, Request, HTTPException
import httpx
import os

app = FastAPI()

# Mengambil variabel lingkungan (Environment Variables) dari Vercel
VERIFY_TOKEN = os.getenv("VERIFY_TOKEN", "magang_rahasia_123")
WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN")
PHONE_NUMBER_ID = os.getenv("PHONE_NUMBER_ID")
LANGFLOW_API_URL = os.getenv("LANGFLOW_API_URL") # Contoh: https://api.langflow.astra.datastax.com/api/v1/run/xxx...
LANGFLOW_BEARER_TOKEN = os.getenv("LANGFLOW_BEARER_TOKEN", "") # Kosongkan jika Langflow Anda berjalan lokal (tanpa auth)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Webhook WhatsApp to Langflow is Running on Vercel!"}

@app.get("/webhook")
async def verify_webhook(request: Request):
    """ Endpoint untuk Verifikasi Webhook Meta/WhatsApp """
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    if mode and token:
        if mode == "subscribe" and token == VERIFY_TOKEN:
            print("Webhook Verified!")
            return int(challenge)
        raise HTTPException(status_code=403, detail="Token Verifikasi Gagal")
    raise HTTPException(status_code=400, detail="Bad Request")

@app.post("/webhook")
async def receive_message(request: Request):
    """ Endpoint untuk menerima pesan dari WhatsApp """
    body = await request.json()
    
    try:
        # Ekstrak data dari format JSON WhatsApp
        entry = body.get("entry", [])[0]
        changes = entry.get("changes", [])[0]
        value = changes.get("value", {})
        
        # Pastikan ini adalah pesan masuk, bukan status pesan (delivered/read)
        if "messages" in value:
            message = value["messages"][0]
            sender_phone = message["from"]
            message_text = message["text"]["body"]
            
            # 1. Kirim pertanyaan ke Langflow
            langflow_reply = await get_langflow_response(message_text)
            
            # 2. Balas pesan ke WhatsApp pengguna
            await send_whatsapp_message(sender_phone, langflow_reply)
            
    except Exception as e:
        print("Error memproses pesan:", e)
        
    # Selalu kembalikan status 200 OK ke WhatsApp agar webhook tidak dianggap error
    return {"status": "ok"}

async def get_langflow_response(text: str) -> str:
    """ Fungsi untuk meneruskan pesan ke API Langflow """
    payload = {
        "input_value": text,
        "output_type": "chat",
        "input_type": "chat"
    }
    
    headers = {"Content-Type": "application/json"}
    if LANGFLOW_BEARER_TOKEN:
        headers["Authorization"] = f"Bearer {LANGFLOW_BEARER_TOKEN}"
        
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(LANGFLOW_API_URL, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            
            # Catatan: Struktur JSON ini mungkin perlu disesuaikan tergantung versi Langflow Anda.
            # Struktur di bawah ini adalah default untuk Langflow versi terbaru
            return data['outputs'][0]['outputs'][0]['results']['message']['text']
        except Exception as e:
            print("Error Langflow API:", e)
            return "Mohon maaf, sistem informasi magang kami sedang dalam pemeliharaan."

async def send_whatsapp_message(to_phone: str, message_text: str):
    """ Fungsi untuk mengirim balasan kembali ke WhatsApp """
    url = f"https://graph.facebook.com/v18.0/{PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json"
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": to_phone,
        "type": "text",
        "text": {"body": message_text}
    }
    
    async with httpx.AsyncClient() as client:
        await client.post(url, json=payload, headers=headers)
