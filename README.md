# SEEINVOID — Returns & Exchange Portal

> Customer-facing return and exchange portal connected to Shopify via MCP.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env.local
# → open .env.local and fill in all keys (see below)

# 3. Run locally
npm start
# → http://localhost:3000

# 4. Build for production
npm run build
```

---

## Environment Variables

| Variable | Where to get it |
|---|---|
| `REACT_APP_EMAILJS_SERVICE_ID` | emailjs.com → Email Services |
| `REACT_APP_EMAILJS_TEMPLATE_ID` | emailjs.com → Email Templates |
| `REACT_APP_EMAILJS_PUBLIC_KEY` | emailjs.com → Account → API Keys |
| `REACT_APP_CLOUDINARY_CLOUD_NAME` | cloudinary.com → Dashboard |
| `REACT_APP_CLOUDINARY_UPLOAD_PRESET` | cloudinary.com → Settings → Upload Presets |

---

## Deploy to Vercel

```bash
npm i -g vercel
vercel login
vercel
# → follow prompts
# → add env vars in Vercel dashboard: Project → Settings → Environment Variables
```

## Deploy to Netlify

```bash
npm run build
# drag & drop the /build folder to netlify.com/drop
# add env vars: Site Settings → Environment Variables
```

---

## Shopify Embed (iframe)

1. Shopify Admin → Online Store → Pages → Add page
2. Click `<>` HTML editor and paste:

```html
<iframe
  src="https://YOUR-DEPLOYED-URL.vercel.app"
  width="100%"
  height="900px"
  frameborder="0"
  style="border:none; background:#0B0B0B;"
  title="Returns & Exchanges">
</iframe>
```

---

## Order Tags Written to Shopify

| Tag | Meaning |
|---|---|
| `RETURN_REQUEST_PENDING` | Request submitted |
| `RETURN_REQUEST_APPROVED` | Manually set when you approve |
| `RETURN_REQUEST_REJECTED` | Manually set when you reject |

---

## Business Rules

- Returns accepted within **14 days** of fulfillment only
- Only **fulfilled** items are selectable
- **Photo is required** — hard block on form submit
- Verification: order number + email + last 4 digits of phone
- Reference ID format: `SV-RETURN-{timestamp}`

---

## Notifications

On every submission the app sends email to:
- seeinvoid@gmail.com
- m7md1hp@gmail.com

Email includes: reference ID, order number, customer email, items, reason, notes, photo link.
