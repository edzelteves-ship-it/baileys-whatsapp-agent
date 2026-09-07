/**
 * Baileys WhatsApp Agent
 * - Connects to WhatsApp Web via Baileys
 * - On incoming message: forwards { from, message } to your n8n webhook
 * - Exposes POST /send-message { to, message } for n8n to call back
 *
 * ENV VARS (set these in Render):
 *   N8N_WEBHOOK_URL   e.g. https://n8n-edzel.onrender.com/webhook/whatsapp-incoming
 *   SEND_API_KEY      a secret you choose, required as header "x-api-key" on /send-message
 *   PORT              provided automatically by Render
 */

const express = require('express');
const P = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || '';
const SEND_API_KEY = process.env.SEND_API_KEY || '';
const PORT = process.env.PORT || 3000;
const AUTH_FOLDER = process.env.AUTH_FOLDER || './auth_state';

let sock; // current active socket
let latestQR = null; // last QR string, shown at /qr as an image

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'warn' }),
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQR = qr;
      qrcode.generate(qr, { small: true }); // also visible in Render logs
      console.log('New QR code generated — open /qr on this service to scan it.');
    }

    if (connection === 'open') {
      latestQR = null;
      console.log('✅ WhatsApp connected.');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed.', statusCode, 'Reconnecting:', shouldReconnect);
      if (shouldReconnect) startSock();
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const from = msg.key.remoteJid;
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        '';

      if (!text) continue;

      console.log('Incoming from', from, ':', text);

      if (N8N_WEBHOOK_URL) {
        try {
          await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from, message: text }),
          });
        } catch (err) {
          console.error('Failed to forward to n8n:', err.message);
        }
      }
    }
  });
}

startSock();

// --- HTTP API ---
const app = express();
app.use(express.json());

// Simple QR viewer so you can scan it from a browser instead of terminal logs.
app.get('/qr', async (req, res) => {
  if (!latestQR) {
    return res.send('No QR pending — either already connected, or not generated yet. Refresh in a few seconds.');
  }
  const QRCode = require('qrcode');
  const dataUrl = await QRCode.toDataURL(latestQR);
  res.send(`<html><body style="text-align:center;font-family:sans-serif">
    <h3>Scan with WhatsApp → Linked Devices</h3>
    <img src="${dataUrl}" />
  </body></html>`);
});

// n8n calls this to send the drafted reply out to WhatsApp
app.post('/send-message', async (req, res) => {
  if (SEND_API_KEY && req.headers['x-api-key'] !== SEND_API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const { to, message } = req.body || {};
  if (!to || !message) {
    return res.status(400).json({ error: 'to and message are required' });
  }
  try {
    await sock.sendMessage(to, { text: message });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Baileys agent listening on port ${PORT}`));
