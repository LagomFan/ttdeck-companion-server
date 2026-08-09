function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderSetupPage({ publicBaseUrl }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TTDeck Companion</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #101114; color: #f4f5f7; }
    main { max-width: 820px; margin: 0 auto; padding: 40px 20px; }
    section { border: 1px solid #2c3038; border-radius: 12px; padding: 24px; background: #181b20; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 24px; align-items: start; }
    label { display: block; margin: 18px 0 8px; color: #b9bec8; font-size: 14px; }
    input { width: 100%; box-sizing: border-box; border: 1px solid #3a404c; border-radius: 8px; padding: 12px; background: #101114; color: #f4f5f7; font: inherit; }
    button { margin-top: 14px; border: 0; border-radius: 8px; padding: 12px 14px; background: #ef4444; color: white; font: inherit; font-weight: 700; cursor: pointer; }
    button:disabled { cursor: wait; opacity: .65; }
    code, textarea { background: #101114; border: 1px solid #2c3038; border-radius: 8px; }
    code { padding: 2px 6px; }
    textarea { width: 100%; min-height: 104px; box-sizing: border-box; padding: 10px; color: #d8dce5; resize: vertical; }
    a { color: #ff6b6b; }
    .muted { color: #a7adba; }
    .status { min-height: 22px; margin-top: 12px; color: #a7adba; }
    .status.error { color: #fca5a5; }
    .qr { display: grid; place-items: center; min-height: 280px; border: 1px dashed #3a404c; border-radius: 12px; background: #111318; }
    .qr img { width: 256px; height: 256px; border-radius: 8px; background: white; }
    .hidden { display: none; }
    @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <section>
      <h1>TTDeck Companion</h1>
      <p class="muted">This server exposes a read-only API for your own iPhone app.</p>
      <p>Server URL: <code>${escapeHtml(publicBaseUrl)}</code></p>
      <div class="grid">
        <div>
          <h2>Bind iPhone</h2>
          <p class="muted">Create a short-lived pairing QR code, then scan it from the iPhone app. The QR code contains a one-time pairing token, not your setup secret.</p>
          <label for="setupSecret">Setup secret</label>
          <input id="setupSecret" type="password" autocomplete="off" placeholder="Required when this page is opened remotely">
          <button id="generateButton" type="button">Generate QR Code</button>
          <p id="status" class="status"></p>
          <label for="payload">Manual pairing payload</label>
          <textarea id="payload" readonly placeholder="Generate a QR code to show the manual payload."></textarea>
        </div>
        <div class="qr">
          <span id="qrEmpty" class="muted">No active QR code</span>
          <img id="qrImage" class="hidden" alt="TTDeck pairing QR code">
        </div>
      </div>
      <h2>Diagnostics</h2>
      <p>Open <a href="/api/setup/diagnostics">/api/setup/diagnostics</a> to check setup status.</p>
    </section>
  </main>
  <script>
    const button = document.getElementById("generateButton");
    const status = document.getElementById("status");
    const qrImage = document.getElementById("qrImage");
    const qrEmpty = document.getElementById("qrEmpty");
    const payload = document.getElementById("payload");

    function setStatus(message, isError = false) {
      status.textContent = message;
      status.classList.toggle("error", isError);
    }

    button.addEventListener("click", async () => {
      button.disabled = true;
      setStatus("Generating pairing QR code...");
      try {
        const setupSecret = document.getElementById("setupSecret").value.trim();
        const headers = { "content-type": "application/json" };
        if (setupSecret) headers["x-setup-secret"] = setupSecret;

        const response = await fetch("/api/bind/start", {
          method: "POST",
          headers,
          body: "{}"
        });
        const body = await response.json();
        if (!response.ok || !body.ok) {
          throw new Error(body.error?.message || "Pairing request failed.");
        }

        qrImage.src = body.data.qrCodeDataUrl;
        qrImage.classList.remove("hidden");
        qrEmpty.classList.add("hidden");
        payload.value = body.data.qrPayload;
        setStatus("QR code is ready. It expires automatically and can only be used once.");
      } catch (error) {
        qrImage.classList.add("hidden");
        qrEmpty.classList.remove("hidden");
        setStatus(error.message, true);
      } finally {
        button.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}

module.exports = {
  renderSetupPage
};
