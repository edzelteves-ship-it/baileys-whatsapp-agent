# Baileys WhatsApp Agent

Connects your WhatsApp to n8n:
- Incoming WhatsApp message → POSTs `{ from, message }` to your n8n webhook
- n8n calls back `POST /send-message` to actually send a WhatsApp message

## 1. One-time: scan the QR (this part only YOU can do — it links your phone)
After deploying, open `https://<your-render-url>/qr` in a browser within a minute or two of the
service starting, and scan it in WhatsApp → **Settings → Linked Devices → Link a Device**.

⚠️ Free-tier Render disks are not persistent, so if the service restarts/redeploys you may need to
re-scan. If that becomes annoying, upgrade to a Render disk-backed instance so `auth_state/` survives restarts.

## 2. Environment variables (set in Render dashboard)
- `N8N_WEBHOOK_URL` = `https://n8n-edzel.onrender.com/webhook/whatsapp-incoming`
- `SEND_API_KEY` = any secret string you choose (also put this in n8n's HTTP Request header `x-api-key`)

## 3. Deploy
Push this folder to a GitHub repo, then in Render: New → Web Service → connect the repo →
Build Command: `npm install` → Start Command: `npm start`.
