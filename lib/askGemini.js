import { GoogleGenAI } from '@google/genai';
import { getSystemPrompt } from './faq.js';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Tanya Gemini 3.5 Flash-Lite dengan konteks FAQ magang (diambil dinamis dari Redis kalau
 * sudah pernah diedit lewat /admin) + riwayat percakapan (kalau ada).
 *
 * @param {string} userMessage - pesan terbaru dari user
 * @param {{role: "user"|"model", text: string}[]} history - riwayat pesan sebelumnya (urut lama → baru), boleh kosong
 */
export async function askGemini(userMessage, history = []) {
  const systemPrompt = await getSystemPrompt();

  const contents = [
    ...history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash-lite',
    contents,
    config: {
      systemInstruction: systemPrompt,
    },
  });

  return response.text || 'Maaf, saya belum bisa menjawab itu. Coba tanyakan dengan cara lain, ya.';
}
