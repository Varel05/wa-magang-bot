import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import webhookHandler from './api/webhook.js';
import telegramHandler from './api/telegram.js';
import usersHandler from './api/admin/users.js';
import historyHandler from './api/admin/history.js';
import contactHandler from './api/admin/contact.js';
import notificationsHandler from './api/admin/notifications.js';
import faqHandler from './api/admin/faq.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// Handler-handler di bawah ini awalnya ditulis untuk Vercel Serverless Functions
// (export default function handler(req, res)). req/res Express kompatibel langsung
// (req.query, req.headers, req.body, res.status().json()/.send()), jadi tidak perlu adapter.
app.all('/api/webhook', webhookHandler);
app.all('/api/telegram', telegramHandler);
app.all('/api/admin/users', usersHandler);
app.all('/api/admin/history', historyHandler);
app.all('/api/admin/contact', contactHandler);
app.all('/api/admin/notifications', notificationsHandler);
app.all('/api/admin/faq', faqHandler);

// Halaman admin (dark-themed panel) — file statis, sama seperti waktu di Vercel.
app.use('/admin', express.static(path.join(__dirname, 'public/admin')));
app.get('/', (_req, res) => res.redirect('/admin'));

app.use((_req, res) => res.status(404).send('Not Found'));

const PORT = Number(process.env.PORT) || 3080;
app.listen(PORT, () => {
  console.log(`✅ wa-magang-bot jalan di http://localhost:${PORT}`);
  console.log(`   Webhook WhatsApp (WAHA) : http://localhost:${PORT}/api/webhook`);
  console.log(`   Webhook Telegram        : http://localhost:${PORT}/api/telegram`);
  console.log(`   Panel admin             : http://localhost:${PORT}/admin`);
});
