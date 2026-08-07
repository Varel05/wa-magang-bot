import { GoogleGenAI } from '@google/genai';
import { SYSTEM_PROMPT } from './faq.js';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Tanya Gemini 3.5 Flash-Lite dengan konteks FAQ magang.
 * Versi ini STATELESS (tidak mengingat chat sebelumnya) — cukup untuk FAQ sederhana.
 * Kalau butuh memory antar pesan, tambahkan penyimpanan riwayat (mis. Vercel KV)
 * dan kirim sebagai riwayat percakapan yang lebih panjang di `contents`.
 */
export async function askGemini(userMessage) {
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash-lite',
    contents: userMessage,
    config: {
      systemInstruction: SYSTEM_PROMPT,
    },
  });

  return response.text || 'Maaf, saya belum bisa menjawab itu. Coba tanyakan dengan cara lain, ya.';
}
