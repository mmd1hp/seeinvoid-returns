import { useState, useRef } from "react";

/* ─────────────────────────────────────────────
   SEEINVOID RETURN & EXCHANGE PORTAL
   Production-ready · Shopify MCP connected
   ───────────────────────────────────────────── */

// ── CONFIG ── inject via env vars in production ──
const CONFIG = {
  SHOPIFY_MCP_URL: "https://seeinvoid-shopify-ai-production.up.railway.app/mcp",
  EMAILJS_SERVICE_ID: process.env.REACT_APP_EMAILJS_SERVICE_ID || "YOUR_SERVICE_ID",
  EMAILJS_TEMPLATE_ID: process.env.REACT_APP_EMAILJS_TEMPLATE_ID || "YOUR_TEMPLATE_ID",
  EMAILJS_PUBLIC_KEY: process.env.REACT_APP_EMAILJS_PUBLIC_KEY || "YOUR_PUBLIC_KEY",
  CLOUDINARY_CLOUD_NAME: process.env.REACT_APP_CLOUDINARY_CLOUD_NAME || "YOUR_CLOUD_NAME",
  CLOUDINARY_UPLOAD_PRESET: process.env.REACT_APP_CLOUDINARY_UPLOAD_PRESET || "seeinvoid_returns",
  NOTIFICATION_EMAILS: ["seeinvoid@gmail.com", "m7md1hp@gmail.com"],
  RETURN_WINDOW_DAYS: 14,
};

// ── SHOPIFY MCP CLIENT ──────────────────────────
class ShopifyMCPClient {
  constructor(mcpUrl) {
    this.mcpUrl = mcpUrl;
  }

  async callTool(toolName, params) {
    const response = await fetch(this.mcpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name: toolName, arguments: params },
      }),
    });
    if (!response.ok) throw new Error(`MCP request failed: ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || "MCP error");
    const content = data.result?.content;
    if (!content || !content[0]) throw new Error("Empty MCP response");
    return JSON.parse(content[0].text || "{}");
  }

  async getOrderByNumber(orderNumber, email) {
    // Try multiple tool names that Shopify MCP might expose
    const tools = ["get_order", "getOrder", "shopify_get_order", "search_orders"];
    let lastErr;
    for (const tool of tools) {
      try {
        return await this.callTool(tool, { order_number: orderNumber, email });
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  }

  async addOrderNote(orderId, note) {
    const tools = ["add_order_note", "addOrderNote", "update_order", "shopify_update_order"];
    let lastErr;
    for (const tool of tools) {
      try {
        return await this.callTool(tool, { order_id: orderId, note });
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  }

  async addOrderTag(orderId, tag) {
    const tools = ["add_order_tags", "addOrderTag", "tag_order", "shopify_tag_order"];
    let lastErr;
    for (const tool of tools) {
      try {
        return await this.callTool(tool, { order_id: orderId, tags: [tag] });
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  }

  async getOrderTags(orderNumber, email) {
    try {
      const order = await this.getOrderByNumber(orderNumber, email);
      return order.tags || order.order?.tags || [];
    } catch (e) {
      throw e;
    }
  }
}

const shopify = new ShopifyMCPClient(CONFIG.SHOPIFY_MCP_URL);

// ── HELPERS ─────────────────────────────────────
function generateReferenceId() {
  return `SV-RETURN-${Date.now()}`;
}

function daysSince(dateStr) {
  if (!dateStr) return 0;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function normalizeTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(t => String(t).toUpperCase());
  if (typeof tags === "string") return tags.split(",").map(t => t.trim().toUpperCase());
  return [];
}

function getReturnStatus(tags) {
  const upper = normalizeTags(tags);
  if (upper.some(t => t.includes("APPROVED"))) return "approved";
  if (upper.some(t => t.includes("REJECTED"))) return "rejected";
  if (upper.some(t => t.includes("RETURN_REQUEST") || t.includes("RETURN REQUEST"))) return "pending";
  return null;
}

async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CONFIG.CLOUDINARY_UPLOAD_PRESET);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CONFIG.CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body: formData }
  );
  if (!res.ok) throw new Error("Image upload failed");
  const data = await res.json();
  return data.secure_url;
}

async function sendEmailNotification(payload) {
  // Load EmailJS dynamically
  if (!window.emailjs) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    window.emailjs.init(CONFIG.EMAILJS_PUBLIC_KEY);
  }

  const itemsText = payload.items
    .map(i => `${i.name} (${i.variant || "N/A"}) × ${i.quantity}`)
    .join(", ");

  const templateParams = {
    reference_id: payload.referenceId,
    order_number: payload.orderNumber,
    customer_email: payload.customerEmail,
    request_type: payload.requestType,
    reason: payload.reason,
    items: itemsText,
    notes: payload.notes || "None",
    photo_url: payload.photoUrl || "No photo",
    to_email: CONFIG.NOTIFICATION_EMAILS.join(","),
    reply_to: payload.customerEmail,
  };

  await window.emailjs.send(
    CONFIG.EMAILJS_SERVICE_ID,
    CONFIG.EMAILJS_TEMPLATE_ID,
    templateParams
  );
}

// ── STYLES ──────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --void: #0B0B0B;
    --void2: #111111;
    --void3: #1A1A1A;
    --border: rgba(255,255,255,0.08);
    --border-hover: rgba(255,255,255,0.18);
    --white: #EDEDE;
    --muted: #888888;
    --accent: #EDEDED;
    --gold: #C9A84C;
    --error: #E05252;
    --success: #4CAF7D;
    --navy: #1A1A2E;
    --green: #203525;
  }

  body {
    background: var(--void);
    color: var(--accent);
    font-family: 'Space Grotesk', sans-serif;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }

  .app {
    min-height: 100vh;
    background: var(--void);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0 16px 80px;
  }

  /* ── HEADER ── */
  .header {
    width: 100%;
    max-width: 560px;
    padding: 40px 0 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .logo-img {
    width: 200px;
    height: auto;
    display: block;
    filter: brightness(1);
  }

  .logo-sub {
    font-size: 11px;
    letter-spacing: 0.22em;
    color: var(--muted);
    text-transform: uppercase;
    margin-top: 2px;
  }

  .header-divider {
    width: 32px;
    height: 1px;
    background: var(--border-hover);
    margin-top: 8px;
  }

  /* ── STEP INDICATOR ── */
  .steps {
    display: flex;
    align-items: center;
    gap: 0;
    margin: 0 0 36px;
  }

  .step-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--border-hover);
    transition: all 0.3s ease;
  }

  .step-dot.active {
    background: #EDEDED;
    transform: scale(1.2);
  }

  .step-dot.done {
    background: var(--gold);
  }

  .step-line {
    width: 28px;
    height: 1px;
    background: var(--border);
    transition: background 0.3s ease;
  }

  .step-line.done {
    background: var(--gold);
  }

  /* ── CARD ── */
  .card {
    width: 100%;
    max-width: 560px;
    background: var(--void2);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 32px;
    animation: fadeUp 0.4s ease;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(16px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .card-title {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: #EDEDED;
    margin-bottom: 6px;
    text-transform: uppercase;
  }

  .card-subtitle {
    font-size: 13px;
    color: var(--muted);
    margin-bottom: 28px;
    line-height: 1.6;
  }

  /* ── FORM ELEMENTS ── */
  .field {
    margin-bottom: 18px;
  }

  .field label {
    display: block;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 8px;
  }

  .field label .req {
    color: var(--gold);
    margin-left: 3px;
  }

  .input {
    width: 100%;
    background: var(--void3);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 16px;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 14px;
    color: #EDEDED;
    outline: none;
    transition: border-color 0.2s;
    appearance: none;
  }

  .input:focus { border-color: var(--border-hover); }
  .input::placeholder { color: rgba(255,255,255,0.2); }
  .input.error { border-color: var(--error); }

  select.input {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='7' viewBox='0 0 12 7'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 14px center;
    padding-right: 36px;
    cursor: pointer;
  }

  textarea.input {
    resize: vertical;
    min-height: 90px;
    line-height: 1.6;
  }

  /* ── BUTTONS ── */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 13px 28px;
    border-radius: 10px;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    outline: none;
  }

  .btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .btn-primary {
    background: #EDEDED;
    color: #0B0B0B;
    width: 100%;
  }

  .btn-primary:hover:not(:disabled) { background: #ffffff; transform: translateY(-1px); }
  .btn-primary:active:not(:disabled) { transform: translateY(0); }

  .btn-ghost {
    background: transparent;
    color: var(--muted);
    border: 1px solid var(--border);
    font-size: 12px;
    padding: 10px 20px;
  }

  .btn-ghost:hover:not(:disabled) { border-color: var(--border-hover); color: #EDEDED; }

  .btn-row {
    display: flex;
    gap: 10px;
    margin-top: 24px;
  }

  /* ── ERROR / ALERT ── */
  .alert {
    border-radius: 10px;
    padding: 12px 16px;
    font-size: 13px;
    margin-bottom: 18px;
    line-height: 1.5;
    animation: fadeUp 0.3s ease;
  }

  .alert-error {
    background: rgba(224,82,82,0.1);
    border: 1px solid rgba(224,82,82,0.3);
    color: #F08080;
  }

  .alert-warn {
    background: rgba(201,168,76,0.1);
    border: 1px solid rgba(201,168,76,0.3);
    color: var(--gold);
  }

  .alert-success {
    background: rgba(76,175,125,0.1);
    border: 1px solid rgba(76,175,125,0.3);
    color: #80C8A0;
  }

  /* ── PRODUCT CARD ── */
  .product-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 24px;
  }

  .product-item {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--void3);
    cursor: pointer;
    transition: all 0.2s;
    user-select: none;
  }

  .product-item:hover { border-color: var(--border-hover); }

  .product-item.selected {
    border-color: rgba(237,237,237,0.4);
    background: rgba(237,237,237,0.04);
  }

  .product-item.ineligible {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .product-img {
    width: 56px;
    height: 56px;
    border-radius: 8px;
    object-fit: cover;
    background: var(--void3);
    flex-shrink: 0;
  }

  .product-img-placeholder {
    width: 56px;
    height: 56px;
    border-radius: 8px;
    background: var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: 20px;
  }

  .product-info { flex: 1; min-width: 0; }

  .product-name {
    font-size: 13px;
    font-weight: 600;
    color: #EDEDED;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .product-variant {
    font-size: 12px;
    color: var(--muted);
    margin-top: 2px;
  }

  .product-price {
    font-size: 13px;
    font-weight: 600;
    color: var(--gold);
    flex-shrink: 0;
  }

  .product-check {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1.5px solid var(--border-hover);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.2s;
    font-size: 11px;
  }

  .product-item.selected .product-check {
    background: #EDEDED;
    border-color: #EDEDED;
    color: #0B0B0B;
  }

  /* ── PHOTO UPLOAD ── */
  .upload-zone {
    border: 1.5px dashed var(--border-hover);
    border-radius: 12px;
    padding: 28px 20px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
    background: var(--void3);
    position: relative;
  }

  .upload-zone:hover, .upload-zone.drag-over {
    border-color: rgba(237,237,237,0.4);
    background: rgba(237,237,237,0.03);
  }

  .upload-zone.has-file {
    border-color: rgba(76,175,125,0.5);
    background: rgba(76,175,125,0.04);
  }

  .upload-zone input[type="file"] {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
    width: 100%;
    height: 100%;
  }

  .upload-icon { font-size: 28px; margin-bottom: 8px; display: block; }

  .upload-text {
    font-size: 13px;
    color: var(--muted);
    line-height: 1.5;
  }

  .upload-text strong { color: #EDEDED; }

  .upload-preview {
    width: 100%;
    max-height: 200px;
    object-fit: cover;
    border-radius: 8px;
    margin-top: 8px;
    display: block;
  }

  /* ── REQUEST TYPE ── */
  .type-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 18px;
  }

  .type-card {
    padding: 16px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--void3);
    cursor: pointer;
    transition: all 0.2s;
    text-align: center;
  }

  .type-card:hover { border-color: var(--border-hover); }

  .type-card.selected {
    border-color: rgba(237,237,237,0.4);
    background: rgba(237,237,237,0.05);
  }

  .type-card-icon { font-size: 22px; margin-bottom: 6px; }
  .type-card-label { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #EDEDED; }
  .type-card-desc { font-size: 11px; color: var(--muted); margin-top: 3px; }

  /* ── CONFIRMATION ── */
  .confirm-ref {
    font-size: 13px;
    letter-spacing: 0.12em;
    color: var(--gold);
    font-weight: 600;
    text-align: center;
    padding: 14px;
    border: 1px solid rgba(201,168,76,0.25);
    border-radius: 10px;
    background: rgba(201,168,76,0.05);
    margin-bottom: 24px;
    font-family: monospace;
  }

  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
    gap: 16px;
  }

  .summary-row:last-child { border-bottom: none; }

  .summary-label { color: var(--muted); flex-shrink: 0; }
  .summary-value { color: #EDEDED; text-align: right; font-weight: 500; }

  .message-box {
    margin-top: 24px;
    padding: 16px;
    border-radius: 10px;
    background: rgba(76,175,125,0.07);
    border: 1px solid rgba(76,175,125,0.2);
    font-size: 13px;
    color: #80C8A0;
    text-align: center;
    line-height: 1.6;
  }

  /* ── STATUS ── */
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin: 16px 0;
  }

  .status-pending { background: rgba(201,168,76,0.1); color: var(--gold); border: 1px solid rgba(201,168,76,0.25); }
  .status-approved { background: rgba(76,175,125,0.1); color: #80C8A0; border: 1px solid rgba(76,175,125,0.25); }
  .status-rejected { background: rgba(224,82,82,0.1); color: #F08080; border: 1px solid rgba(224,82,82,0.25); }

  /* ── TABS ── */
  .tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
    margin-bottom: 28px;
    gap: 0;
  }

  .tab {
    padding: 12px 20px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.2s;
    background: transparent;
    border-top: none;
    border-left: none;
    border-right: none;
    font-family: 'Space Grotesk', sans-serif;
  }

  .tab:hover { color: #EDEDED; }
  .tab.active { color: #EDEDED; border-bottom-color: #EDEDED; }

  /* ── LOADING ── */
  .spinner {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255,255,255,0.15);
    border-top-color: #EDEDED;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    display: inline-block;
    flex-shrink: 0;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .loading-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 48px 0;
    color: var(--muted);
    font-size: 13px;
  }

  /* ── DIVIDER ── */
  .section-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 20px 0 16px;
  }

  .section-divider span {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    white-space: nowrap;
  }

  .section-divider::before, .section-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  /* ── EXCHANGE SIZE ── */
  .size-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }

  .size-chip {
    padding: 7px 14px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--void3);
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    cursor: pointer;
    transition: all 0.2s;
    font-family: 'Space Grotesk', sans-serif;
    letter-spacing: 0.06em;
  }

  .size-chip:hover { border-color: var(--border-hover); color: #EDEDED; }
  .size-chip.selected { border-color: rgba(237,237,237,0.4); color: #EDEDED; background: rgba(237,237,237,0.06); }

  /* ── POLICY TOGGLE ── */
  .policy-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 18px;
    padding: 10px 14px;
    border: 1px solid rgba(201,168,76,0.2);
    border-radius: 8px;
    background: rgba(201,168,76,0.03);
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s;
    user-select: none;
  }

  .policy-toggle:hover {
    background: rgba(201,168,76,0.07);
    border-color: rgba(201,168,76,0.4);
  }

  .policy-toggle-icon {
    font-size: 14px;
    color: var(--gold);
    flex-shrink: 0;
  }

  .policy-toggle-label {
    flex: 1;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--gold);
  }

  .policy-toggle-chevron {
    font-size: 11px;
    color: var(--gold);
    transition: transform 0.2s;
  }

  .policy-toggle-chevron.open {
    transform: rotate(180deg);
  }

  .policy-content {
    margin-top: 0;
    border: 1px solid rgba(201,168,76,0.15);
    border-top: none;
    border-radius: 0 0 8px 8px;
    background: rgba(201,168,76,0.02);
    overflow: hidden;
    display: flex;
    gap: 0;
  }

  .policy-col {
    flex: 1;
    min-width: 0;
    padding: 14px 16px;
  }

  .policy-col.en {
    border-right: 1px solid rgba(201,168,76,0.1);
  }

  .policy-col.ar {
    text-align: right;
    direction: rtl;
  }

  .policy-section-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(237,237,237,0.45);
    margin-bottom: 5px;
  }

  .policy-section-label.ar {
    letter-spacing: 0;
  }

  .policy-body {
    font-size: 12px;
    color: rgba(237,237,237,0.7);
    line-height: 1.65;
  }

  /* ── FOOTER ── */
  .footer {
    margin-top: 40px;
    font-size: 11px;
    color: rgba(255,255,255,0.2);
    letter-spacing: 0.1em;
    text-align: center;
    text-transform: uppercase;
  }
`;

// ── POLICY TOGGLE ────────────────────────────────
function PolicyToggle() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="policy-toggle" onClick={() => setOpen(o => !o)} style={{ borderRadius: open ? "8px 8px 0 0" : "8px" }}>
        <span className="policy-toggle-icon">📋</span>
        <span className="policy-toggle-label">Return &amp; Exchange Policy</span>
        <span className={`policy-toggle-chevron${open ? " open" : ""}`}>▼</span>
      </div>
      {open && (
        <div className="policy-content">
          <div className="policy-col en">
            <div className="policy-section-label">Return Window</div>
            <div className="policy-body">You have 14 days from the date of delivery to submit a return or exchange request.</div>
          </div>
          <div className="policy-col ar">
            <div className="policy-section-label ar">فترة الاسترجاع</div>
            <div className="policy-body">عندك 14 يوم من تاريخ التوصيل عشان تقدم طلب استرجاع أو استبدال.</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SCREEN: ORDER LOOKUP ─────────────────────────
function OrderLookup({ onFound }) {
  const [form, setForm] = useState({ orderNumber: "", email: "", phone4: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    if (!form.orderNumber.trim() || !form.email.trim() || !form.phone4.trim()) {
      setError("All fields are required.");
      return;
    }
    if (!/^\d{4}$/.test(form.phone4)) {
      setError("Please enter exactly 4 digits for phone verification.");
      return;
    }
    setLoading(true);
    try {
      const order = await shopify.getOrderByNumber(form.orderNumber.trim(), form.email.trim());

      // Normalise order object (Shopify MCP can return different shapes)
      const o = order.order || order;

      // Verify email
      const orderEmail = (o.email || o.customer?.email || "").toLowerCase();
      if (orderEmail && orderEmail !== form.email.trim().toLowerCase()) {
        setError("Email does not match this order.");
        setLoading(false);
        return;
      }

      // Verify phone last 4
      const phone = o.phone || o.customer?.phone || o.billing_address?.phone || "";
      const cleanPhone = phone.replace(/\D/g, "");
      if (phone && cleanPhone.slice(-4) !== form.phone4) {
        setError("Phone number last 4 digits do not match.");
        setLoading(false);
        return;
      }

      // Check delivery date for 14-day window
      const fulfilledAt = o.fulfilled_at || o.fulfillments?.[0]?.created_at || o.created_at;
      const age = daysSince(fulfilledAt);
      if (age > CONFIG.RETURN_WINDOW_DAYS) {
        setError(`This order was fulfilled ${age} days ago. Returns are only accepted within ${CONFIG.RETURN_WINDOW_DAYS} days of delivery.`);
        setLoading(false);
        return;
      }

      onFound({ order: o, email: form.email.trim() });
    } catch (e) {
      console.error(e);
      setError("Order not found. Please check your order number and email address.");
    }
    setLoading(false);
  };

  return (
    <div className="card">
      <div className="card-title">Find Your Order</div>
      <div className="card-subtitle">Enter your order details to begin a return or exchange request.</div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="field">
        <label>Order Number <span className="req">*</span></label>
        <input
          className={`input ${error && !form.orderNumber ? "error" : ""}`}
          placeholder="#1001"
          value={form.orderNumber}
          onChange={e => setForm(f => ({ ...f, orderNumber: e.target.value }))}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
        />
      </div>

      <div className="field">
        <label>Email Address <span className="req">*</span></label>
        <input
          className="input"
          type="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
        />
      </div>

      <div className="field">
        <label>Last 4 Digits of Phone <span className="req">*</span></label>
        <input
          className="input"
          placeholder="e.g. 4521"
          maxLength={4}
          value={form.phone4}
          onChange={e => setForm(f => ({ ...f, phone4: e.target.value.replace(/\D/g, "") }))}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
        />
      </div>

      <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
        {loading ? <><span className="spinner" /> Looking up order...</> : "Continue →"}
      </button>

      <PolicyToggle />
    </div>
  );
}

// ── SCREEN: ITEM SELECTION ───────────────────────
function ItemSelection({ order, onNext, onBack }) {
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState("");

  // Extract line items — handle different MCP response shapes
  const lineItems = order.line_items || order.lineItems || [];
  const fulfillments = order.fulfillments || [];
  const fulfilledIds = new Set();
  fulfillments.forEach(f => {
    (f.line_items || f.lineItems || []).forEach(li => fulfilledIds.add(li.id || li.variant_id));
  });

  const items = lineItems.map(li => ({
    id: li.id,
    name: li.name || li.title,
    variant: li.variant_title || li.variant?.title || "",
    price: li.price,
    quantity: li.quantity || 1,
    image: li.image?.src || li.product?.image?.src || null,
    fulfilled: fulfilledIds.size === 0 || fulfilledIds.has(li.id) || fulfilledIds.has(li.variant_id),
    sku: li.sku,
    variantId: li.variant_id,
  }));

  const toggle = (item) => {
    if (!item.fulfilled) return;
    setSelected(prev =>
      prev.find(i => i.id === item.id)
        ? prev.filter(i => i.id !== item.id)
        : [...prev, item]
    );
  };

  const proceed = () => {
    if (selected.length === 0) {
      setError("Please select at least one item to return or exchange.");
      return;
    }
    onNext(selected);
  };

  return (
    <div className="card">
      <div className="card-title">Select Items</div>
      <div className="card-subtitle">
        Order #{order.order_number || order.name || order.id} · Choose the item(s) you want to return or exchange.
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {items.length === 0 && (
        <div className="alert alert-warn">No line items found in this order.</div>
      )}

      <div className="product-grid">
        {items.map(item => (
          <div
            key={item.id}
            className={`product-item ${selected.find(i => i.id === item.id) ? "selected" : ""} ${!item.fulfilled ? "ineligible" : ""}`}
            onClick={() => toggle(item)}
            title={!item.fulfilled ? "This item has not been fulfilled yet" : ""}
          >
            {item.image
              ? <img src={item.image} alt={item.name} className="product-img" />
              : <div className="product-img-placeholder">👕</div>
            }
            <div className="product-info">
              <div className="product-name">{item.name}</div>
              {item.variant && <div className="product-variant">{item.variant}</div>}
              {!item.fulfilled && <div className="product-variant" style={{ color: "var(--error)" }}>Not yet fulfilled</div>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
              <span className="product-price">
                {item.price ? `$${parseFloat(item.price).toFixed(2)}` : ""}
              </span>
              <div className="product-check">
                {selected.find(i => i.id === item.id) && "✓"}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="btn-row">
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" onClick={proceed} style={{ flex: 1 }}>
          Continue ({selected.length} item{selected.length !== 1 ? "s" : ""}) →
        </button>
      </div>
    </div>
  );
}

// ── SCREEN: REQUEST FORM ─────────────────────────
function RequestForm({ order, items, onSubmit, onBack }) {
  const [requestType, setRequestType] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [exchangeSizes, setExchangeSizes] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);

  const REASONS = ["Wrong Size", "Defective / Damaged", "Changed Mind", "Wrong Item Received", "Other"];
  const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

  const handleFile = (file) => {
    if (!file || !file.type.startsWith("image/")) {
      setError("Please upload a valid image file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be under 10MB.");
      return;
    }
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setError("");
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleSubmit = async () => {
    setError("");
    if (!requestType) { setError("Please select a request type."); return; }
    if (!reason) { setError("Please select a reason."); return; }
    if (!photo) { setError("A photo is required. Please attach an image of the item(s)."); return; }

    setLoading(true);
    try {
      // Upload photo
      let photoUrl = "";
      try {
        photoUrl = await uploadToCloudinary(photo);
      } catch (uploadErr) {
        console.warn("Cloudinary upload failed, using placeholder", uploadErr);
        photoUrl = "Photo upload failed — attached in original request";
      }

      const referenceId = generateReferenceId();

      // Build note
      const itemsStr = items.map(i => `${i.name}${i.variant ? ` (${i.variant})` : ""}`).join("; ");
      const noteText = `RETURN REQUEST | ${referenceId} | ${requestType.toUpperCase()} | ${reason} | Items: ${itemsStr} | Notes: ${notes || "none"} | Photo: ${photoUrl}`;

      const orderId = order.id;

      // Submit to Shopify
      try {
        await shopify.addOrderNote(orderId, noteText);
      } catch (e) {
        console.warn("addOrderNote failed:", e);
      }
      try {
        await shopify.addOrderTag(orderId, "RETURN_REQUEST_PENDING");
      } catch (e) {
        console.warn("addOrderTag failed:", e);
      }

      // Send email notification
      try {
        await sendEmailNotification({
          referenceId,
          orderNumber: order.order_number || order.name || order.id,
          customerEmail: order.email || order.customer?.email || "unknown",
          requestType,
          reason,
          items,
          notes,
          photoUrl,
        });
      } catch (mailErr) {
        console.warn("Email notification failed:", mailErr);
      }

      onSubmit({
        referenceId,
        requestType,
        reason,
        notes,
        items,
        photoUrl,
        exchangeSizes,
      });
    } catch (e) {
      console.error(e);
      setError("Submission failed. Please try again or contact support.");
    }
    setLoading(false);
  };

  return (
    <div className="card">
      <div className="card-title">Request Details</div>
      <div className="card-subtitle">Tell us what you'd like to do with {items.length} selected item{items.length !== 1 ? "s" : ""}.</div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Request Type */}
      <div className="field">
        <label>Request Type <span className="req">*</span></label>
        <div className="type-grid">
          <div className={`type-card ${requestType === "Refund" ? "selected" : ""}`} onClick={() => setRequestType("Refund")}>
            <div className="type-card-icon">↩</div>
            <div className="type-card-label">Refund</div>
            <div className="type-card-desc">Get your money back</div>
          </div>
          <div className={`type-card ${requestType === "Exchange" ? "selected" : ""}`} onClick={() => setRequestType("Exchange")}>
            <div className="type-card-icon">⇄</div>
            <div className="type-card-label">Exchange</div>
            <div className="type-card-desc">Swap for another size</div>
          </div>
        </div>
      </div>

      {/* Exchange size selection */}
      {requestType === "Exchange" && items.map(item => (
        <div className="field" key={item.id}>
          <label>New size for: {item.name}</label>
          <div className="size-grid">
            {SIZES.map(size => (
              <button
                key={size}
                className={`size-chip ${exchangeSizes[item.id] === size ? "selected" : ""}`}
                onClick={() => setExchangeSizes(prev => ({ ...prev, [item.id]: size }))}
              >
                {size}
              </button>
            ))}
            <button
              className={`size-chip ${exchangeSizes[item.id] === "manual" ? "selected" : ""}`}
              onClick={() => setExchangeSizes(prev => ({ ...prev, [item.id]: "manual" }))}
            >
              Other / Manual
            </button>
          </div>
        </div>
      ))}

      {/* Reason */}
      <div className="field">
        <label>Reason <span className="req">*</span></label>
        <select className="input" value={reason} onChange={e => setReason(e.target.value)}>
          <option value="">Select a reason...</option>
          {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {/* Photo Upload */}
      <div className="field">
        <label>Photo Evidence <span className="req">*</span></label>
        <div
          className={`upload-zone ${dragOver ? "drag-over" : ""} ${photo ? "has-file" : ""}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept="image/*"
            ref={fileRef}
            onChange={e => handleFile(e.target.files[0])}
          />
          {photo ? (
            <>
              <img src={photoPreview} alt="Preview" className="upload-preview" />
              <div className="upload-text" style={{ marginTop: 8, color: "var(--success)" }}>
                ✓ {photo.name}
              </div>
            </>
          ) : (
            <>
              <span className="upload-icon">📷</span>
              <div className="upload-text">
                <strong>Drag & drop</strong> or click to upload<br />
                JPG, PNG, WEBP · Max 10MB
              </div>
            </>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="field">
        <label>Additional Notes</label>
        <textarea
          className="input"
          placeholder="Describe the issue in more detail (optional)..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      <div className="btn-row">
        <button className="btn btn-ghost" onClick={onBack} disabled={loading}>← Back</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={loading} style={{ flex: 1 }}>
          {loading ? <><span className="spinner" /> Submitting...</> : "Submit Request →"}
        </button>
      </div>
    </div>
  );
}

// ── SCREEN: CONFIRMATION ─────────────────────────
function Confirmation({ result, order, onReset }) {
  const orderNum = order.order_number || order.name || order.id;

  return (
    <div className="card">
      <div className="card-title">Request Submitted</div>
      <div className="confirm-ref">{result.referenceId}</div>

      <div>
        {[
          ["Order", `#${orderNum}`],
          ["Request Type", result.requestType],
          ["Reason", result.reason],
          ["Items", result.items.map(i => i.name).join(", ")],
          result.notes ? ["Notes", result.notes] : null,
        ].filter(Boolean).map(([label, value]) => (
          <div className="summary-row" key={label}>
            <span className="summary-label">{label}</span>
            <span className="summary-value">{value}</span>
          </div>
        ))}
      </div>

      <div className="message-box">
        Your request has been submitted. We will review it within 24–48 hours.
        Keep your reference ID for tracking.
      </div>

      <div className="btn-row" style={{ marginTop: 24 }}>
        <button className="btn btn-primary" onClick={onReset}>Submit Another Request</button>
      </div>
    </div>
  );
}

// ── SCREEN: STATUS TRACKER ───────────────────────
function StatusTracker() {
  const [form, setForm] = useState({ orderNumber: "", email: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null);
  const [orderData, setOrderData] = useState(null);

  const handleCheck = async () => {
    setError(""); setStatus(null); setOrderData(null);
    if (!form.orderNumber.trim() || !form.email.trim()) {
      setError("Please enter your order number and email.");
      return;
    }
    setLoading(true);
    try {
      const order = await shopify.getOrderByNumber(form.orderNumber.trim(), form.email.trim());
      const o = order.order || order;
      const tags = o.tags || [];
      const statusKey = getReturnStatus(tags);
      if (!statusKey) {
        setError("No return request found for this order.");
      } else {
        setStatus(statusKey);
        setOrderData(o);
      }
    } catch (e) {
      setError("Order not found. Please check your details.");
    }
    setLoading(false);
  };

  const statusConfig = {
    pending: { label: "Under Review", cls: "status-pending", msg: "Your request is being reviewed by our team. You will hear from us within 24–48 hours." },
    approved: { label: "Approved", cls: "status-approved", msg: "Great news! Your return/exchange has been approved. Check your email for next steps." },
    rejected: { label: "Not Approved", cls: "status-rejected", msg: "Unfortunately your request was not approved. Please contact us if you believe this is an error." },
  };

  return (
    <div className="card">
      <div className="card-title">Track Your Request</div>
      <div className="card-subtitle">Enter your order details to check the status of a submitted return or exchange.</div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="field">
        <label>Order Number <span className="req">*</span></label>
        <input className="input" placeholder="#1001" value={form.orderNumber} onChange={e => setForm(f => ({ ...f, orderNumber: e.target.value }))} />
      </div>

      <div className="field">
        <label>Email Address <span className="req">*</span></label>
        <input className="input" type="email" placeholder="you@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
      </div>

      <button className="btn btn-primary" onClick={handleCheck} disabled={loading}>
        {loading ? <><span className="spinner" /> Checking...</> : "Check Status →"}
      </button>

      {status && statusConfig[status] && (
        <div style={{ marginTop: 24 }}>
          <div className={`status-badge ${statusConfig[status].cls}`}>
            ● {statusConfig[status].label}
          </div>
          <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, marginTop: 8 }}>
            {statusConfig[status].msg}
          </p>
          {orderData && (
            <div style={{ marginTop: 16, fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
              Order #{orderData.order_number || orderData.name || orderData.id}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── STEP INDICATOR ───────────────────────────────
function StepIndicator({ current, total }) {
  return (
    <div className="steps">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center" }}>
          <div className={`step-dot ${i < current ? "done" : i === current ? "active" : ""}`} />
          {i < total - 1 && <div className={`step-line ${i < current ? "done" : ""}`} />}
        </div>
      ))}
    </div>
  );
}

// ── ROOT APP ─────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("new"); // "new" | "track"
  const [step, setStep] = useState(0);
  const [orderData, setOrderData] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [result, setResult] = useState(null);

  const reset = () => {
    setStep(0);
    setOrderData(null);
    setSelectedItems([]);
    setResult(null);
  };

  const STEPS = 4;

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <div className="header">
          <img src="/logo.png" alt="SEEINVOID" className="logo-img" />
          <div className="logo-sub">Still · Aware</div>
          <div className="header-divider" />
        </div>

        <div style={{ width: "100%", maxWidth: 560, marginBottom: 0 }}>
          <div className="tabs">
            <button className={`tab ${tab === "new" ? "active" : ""}`} onClick={() => { setTab("new"); reset(); }}>
              New Request
            </button>
            <button className={`tab ${tab === "track" ? "active" : ""}`} onClick={() => setTab("track")}>
              Track Status
            </button>
          </div>
        </div>

        {tab === "new" && !result && step < 3 && (
          <StepIndicator current={step} total={STEPS} />
        )}

        {tab === "new" && (
          <>
            {step === 0 && (
              <OrderLookup onFound={data => { setOrderData(data); setStep(1); }} />
            )}
            {step === 1 && orderData && (
              <ItemSelection
                order={orderData.order}
                onNext={items => { setSelectedItems(items); setStep(2); }}
                onBack={() => setStep(0)}
              />
            )}
            {step === 2 && orderData && (
              <RequestForm
                order={orderData.order}
                items={selectedItems}
                onSubmit={res => { setResult(res); setStep(3); }}
                onBack={() => setStep(1)}
              />
            )}
            {step === 3 && result && orderData && (
              <Confirmation result={result} order={orderData.order} onReset={reset} />
            )}
          </>
        )}

        {tab === "track" && <StatusTracker />}

        <div className="footer">© 2026 SEEINVOID · All rights reserved</div>
      </div>
    </>
  );
}
