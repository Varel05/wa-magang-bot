from fastapi import FastAPI, Request
import httpx
import os

app = FastAPI()

# Mengambil variabel lingkungan (Environment Variables)
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
LANGFLOW_API_URL = os.getenv("LANGFLOW_API_URL") 
LANGFLOW_BEARER_TOKEN = os.getenv("LANGFLOW_BEARER_TOKEN", "") 

TELEGRAM_API_URL = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Telegram Bot Webhook is Running on Vercel!"}

@app.post("/webhook")
async def receive_telegram_message(request: Request):
    """ Endpoint untuk menerima pesan dari Telegram """
    try:
        update = await request.json()
        
        # Pastikan ada pesan teks yang dikirim
        if "message" in update and "text" in update["message"]:
            chat_id = update["message"]["chat"]["id"]
            message_text = update["message"]["text"]
            
            # 1. Kirim pertanyaan ke Langflow
            langflow_reply = await get_langflow_response(message_text)
            
            # 2. Balas pesan ke Telegram pengguna
            await send_telegram_message(chat_id, langflow_reply)
            
    except Exception as e:
        print("Error memproses pesan:", e)
        
    # Selalu kembalikan status 200 OK ke Telegram
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
            
            return data['outputs'][0]['outputs'][0]['results']['message']['text']
        except Exception as e:
            print("Error Langflow API:", e)
            return "Mohon maaf, sistem informasi magang kami sedang dalam pemeliharaan."

async def send_telegram_message(chat_id: int, text: str):
    """ Fungsi untuk mengirim balasan kembali ke Telegram """
    url = f"{TELEGRAM_API_URL}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text
    }
    
    async with httpx.AsyncClient() as client:
        await client.post(url, json=payload)