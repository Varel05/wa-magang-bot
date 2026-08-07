const TELEGRAM_API_BASE = 'https://api.telegram.org';

export async function sendTelegramMessage(botToken, chatId, text) {
  const url = `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error('❌ Gagal kirim pesan Telegram:', errBody);
  }
}

export async function sendTelegramTyping(botToken, chatId) {
  const url = `${TELEGRAM_API_BASE}/bot${botToken}/sendChatAction`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
    });
  } catch (_) {
    // status "mengetik" bukan hal krusial, abaikan kalau gagal
  }
}
