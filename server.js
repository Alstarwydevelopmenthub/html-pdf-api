const express = require("express");
const { chromium } = require("playwright");
const multer = require("multer");
const pdfParse = require("pdf-parse");

const app = express();

const PORT = process.env.PORT || 10000;

const PDF_API_KEY = process.env.PDF_API_KEY || "";
const PDF_TEXT_API_KEY = process.env.PDF_TEXT_API_KEY || "";

const MAX_HTML_BYTES = Number(process.env.MAX_HTML_BYTES || 10 * 1024 * 1024);
const MAX_PDF_BYTES = Number(process.env.MAX_PDF_BYTES || 10 * 1024 * 1024);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PDF_BYTES,
  },
});

app.use(express.json({ limit: "10mb" }));
app.use(express.text({ type: ["text/html", "text/plain"], limit: "10mb" }));

function sanitizeFilename(name) {
  if (!name || typeof name !== "string") return "document.pdf";

  const cleaned = name
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "document.pdf";
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

function requireApiKey(envKeyName) {
  return function (req, res, next) {
    const expectedKey = process.env[envKeyName] || "";
    const providedKey = req.header("x-api-key");

    if (!expectedKey) {
      return res.status(500).json({
        ok: false,
        error: `${envKeyName} is missing in Render environment variables.`,
      });
    }

    if (!providedKey || providedKey !== expectedKey) {
      return res.status(401).json({
        ok: false,
        error: `Unauthorized. Missing or invalid x-api-key for ${envKeyName}.`,
      });
    }

    next();
  };
}

function buildPdfOptions(options = {}) {
  return {
    format: options.format || "A4",
    landscape: Boolean(options.landscape),
    printBackground: options.printBackground !== false,
    scale: Number(options.scale) || 1,
    preferCSSPageSize: options.preferCSSPageSize !== false,
    margin: {
      top: options.margin?.top || "10mm",
      right: options.margin?.right || "10mm",
      bottom: options.margin?.bottom || "10mm",
      left: options.margin?.left || "10mm",
    },
  };
}

app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html");

  res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>PDF Tools API</title>
  <style>
    body {
      margin: 0;
      background: #eef2f7;
      font-family: Arial, sans-serif;
      color: #172033;
    }

    .page {
      min-height: 100vh;
      padding: 22px;
      display: flex;
      justify-content: center;
    }

    .wrap {
      width: 100%;
      max-width: 1050px;
    }

    .hero {
      background: #172033;
      color: white;
      padding: 24px;
      border-radius: 22px;
      margin-bottom: 18px;
    }

    .hero h1 {
      margin: 0 0 8px;
      font-size: 34px;
    }

    .hero p {
      margin: 0;
      color: rgba(255,255,255,0.75);
      line-height: 1.5;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
    }

    .card {
      background: white;
      border-radius: 22px;
      padding: 22px;
      box-shadow: 0 18px 50px rgba(0,0,0,0.10);
    }

    h2 {
      margin: 0 0 8px;
      font-size: 24px;
    }

    p {
      color: #5b6473;
      line-height: 1.5;
    }

    label {
      display: block;
      margin-top: 14px;
      font-weight: bold;
    }

    input, select, textarea {
      width: 100%;
      margin-top: 8px;
      padding: 12px;
      border: 1px solid #d7dce5;
      border-radius: 12px;
      font-size: 15px;
      box-sizing: border-box;
    }

    textarea {
      min-height: 280px;
      font-family: monospace;
      font-size: 13px;
    }

    button {
      margin-top: 16px;
      background: #172033;
      color: white;
      border: 0;
      padding: 13px 18px;
      border-radius: 999px;
      font-weight: bold;
      cursor: pointer;
    }

    button:disabled {
      opacity: 0.6;
      cursor: wait;
    }

    .status {
      margin-top: 12px;
      font-weight: bold;
      white-space: pre-wrap;
      color: #172033;
    }

    .output {
      min-height: 260px;
      white-space: pre-wrap;
    }

    code {
      background: #f1f4f8;
      padding: 2px 6px;
      border-radius: 6px;
    }

    @media(max-width: 850px) {
      .grid {
        grid-template-columns: 1fr;
      }

      .hero h1 {
        font-size: 28px;
      }
    }
  </style>
</head>
<body>
  <main class="page">
    <div class="wrap">
      <section class="hero">
        <h1>PDF Tools API</h1>
        <p>
          This Render service now supports <strong>HTML to PDF</strong> and
          <strong>text-based PDF to text</strong>.
        </p>
      </section>

      <section class="grid">
        <div class="card">
          <h2>HTML → PDF</h2>
          <p>Uses <code>PDF_API_KEY</code>.</p>

          <label>HTML API Key</label>
          <input id="htmlApiKey" type="password" placeholder="Paste PDF_API_KEY" />

          <label>Filename</label>
          <input id="filename" value="test-document.pdf" />

          <label>Page Size</label>
          <select id="format">
            <option>A4</option>
            <option>A3</option>
            <option>A5</option>
            <option>Letter</option>
            <option>Legal</option>
          </select>

          <label>HTML</label>
          <textarea id="htmlInput"></textarea>

          <button id="convertBtn">Convert to PDF</button>
          <div id="htmlStatus" class="status"></div>
        </div>

        <div class="card">
          <h2>PDF → Text</h2>
          <p>
            Uses <code>PDF_TEXT_API_KEY</code>. This works for text-based PDFs only,
            not scanned image PDFs.
          </p>

          <label>PDF Text API Key</label>
          <input id="textApiKey" type="password" placeholder="Paste PDF_TEXT_API_KEY" />

          <label>Upload Text-Based PDF</label>
          <input id="pdfFile" type="file" accept="application/pdf" />

          <button id="extractBtn">Extract Text</button>
          <div id="textStatus" class="status"></div>

          <label>Extracted Text</label>
          <textarea id="textOutput" class="output" readonly></textarea>
        </div>
      </section>
    </div>
  </main>

  <script>
    const htmlInput = document.getElementById("htmlInput");
    const htmlApiKey = document.getElementById("htmlApiKey");
    const filename = document.getElementById("filename");
    const format = document.getElementById("format");
    const convertBtn = document.getElementById("convertBtn");
    const htmlStatus = document.getElementById("htmlStatus");

    const textApiKey = document.getElementById("textApiKey");
    const pdfFile = document.getElementById("pdfFile");
    const extractBtn = document.getElementById("extractBtn");
    const textStatus = document.getElementById("textStatus");
    const textOutput = document.getElementById("textOutput");

    htmlInput.value = '<!doctype html>\\n<html>\\n<head>\\n  <meta charset="utf-8" />\\n  <title>Sample PDF</title>\\n  <style>\\n    @page { size: A4; margin: 14mm; }\\n    body { font-family: Arial, sans-serif; color: #172033; }\\n    .box { border: 2px solid #172033; border-radius: 14px; padding: 28px; }\\n    h1 { margin: 0 0 10px; font-size: 34px; }\\n    table { width: 100%; border-collapse: collapse; margin-top: 24px; }\\n    th, td { border-bottom: 1px solid #ddd; padding: 12px; text-align: left; }\\n    th { background: #f1f4f8; }\\n    .total { text-align: right; font-weight: bold; font-size: 22px; margin-top: 24px; }\\n  </style>\\n</head>\\n<body>\\n  <div class="box">\\n    <h1>Sample Invoice</h1>\\n    <p>This is a high-quality HTML to PDF test.</p>\\n    <table>\\n      <thead>\\n        <tr><th>Description</th><th>Qty</th><th>Amount</th></tr>\\n      </thead>\\n      <tbody>\\n        <tr><td>HTML to PDF Conversion</td><td>1</td><td>KES 5,000</td></tr>\\n        <tr><td>Browser Rendering</td><td>1</td><td>KES 3,000</td></tr>\\n      </tbody>\\n    </table>\\n    <p class="total">Total: KES 8,000</p>\\n  </div>\\n</body>\\n</html>';

    convertBtn.addEventListener("click", async () => {
      htmlStatus.textContent = "";

      if (!htmlApiKey.value.trim()) {
        htmlStatus.textContent = "Paste PDF_API_KEY first.";
        return;
      }

      convertBtn.disabled = true;
      convertBtn.textContent = "Converting...";

      try {
        const response = await fetch("/api/html-to-pdf", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": htmlApiKey.value.trim()
          },
          body: JSON.stringify({
            html: htmlInput.value,
            filename: filename.value || "document.pdf",
            options: {
              format: format.value,
              printBackground: true,
              scale: 1,
              preferCSSPageSize: true,
              margin: {
                top: "10mm",
                right: "10mm",
                bottom: "10mm",
                left: "10mm"
              }
            }
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = filename.value || "document.pdf";
        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);

        htmlStatus.textContent = "PDF generated successfully.";
      } catch (err) {
        htmlStatus.textContent = "Error: " + err.message;
      } finally {
        convertBtn.disabled = false;
        convertBtn.textContent = "Convert to PDF";
      }
    });

    extractBtn.addEventListener("click", async () => {
      textStatus.textContent = "";
      textOutput.value = "";

      if (!textApiKey.value.trim()) {
        textStatus.textContent = "Paste PDF_TEXT_API_KEY first.";
        return;
      }

      if (!pdfFile.files || !pdfFile.files[0]) {
        textStatus.textContent = "Choose a PDF file first.";
        return;
      }

      extractBtn.disabled = true;
      extractBtn.textContent = "Extracting...";

      try {
        const formData = new FormData();
        formData.append("pdf", pdfFile.files[0]);

        const response = await fetch("/api/pdf-to-text", {
          method: "POST",
          headers: {
            "x-api-key": textApiKey.value.trim()
          },
          body: formData
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(JSON.stringify(data));
        }

        textStatus.textContent = "Extracted " + data.pageCount + " page(s).";
        textOutput.value = data.fullText || "";
      } catch (err) {
        textStatus.textContent = "Error: " + err.message;
      } finally {
        extractBtn.disabled = false;
        extractBtn.textContent = "Extract Text";
      }
    });
  </script>
</body>
</html>`);
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "pdf-tools-api",
    status: "running",
    tools: ["html-to-pdf", "pdf-to-text"],
  });
});

app.post("/api/html-to-pdf", requireApiKey("PDF_API_KEY"), async (req, res) => {
  let browser;

  try {
    let html;
    let filename = "document.pdf";
    let options = {};

    if (typeof req.body === "string") {
      html = req.body;
    } else {
      html = req.body?.html;
      filename = req.body?.filename || filename;
      options = req.body?.options || {};
    }

    if (!html || typeof html !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Missing HTML. Send JSON with { html: '<html>...</html>' }.",
      });
    }

    const size = Buffer.byteLength(html, "utf8");

    if (size > MAX_HTML_BYTES) {
      return res.status(413).json({
        ok: false,
        error: "HTML too large.",
        size,
        limit: MAX_HTML_BYTES,
      });
    }

    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
        "--no-zygote",
      ],
    });

    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "load",
      timeout: 30000,
    });

    await page.emulateMedia({ media: "print" });

    const pdfBuffer = await page.pdf(buildPdfOptions(options));

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${sanitizeFilename(filename)}"`
    );

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("FULL HTML TO PDF ERROR:", error);

    return res.status(500).json({
      ok: false,
      error: "PDF conversion failed.",
      details: error.message,
      stack: error.stack,
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
});

app.post(
  "/api/pdf-to-text",
  requireApiKey("PDF_TEXT_API_KEY"),
  upload.single("pdf"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: "Missing PDF file. Upload using form field name: pdf",
        });
      }

      if (req.file.mimetype !== "application/pdf") {
        return res.status(400).json({
          ok: false,
          error: "Invalid file type. Upload a PDF file only.",
          receivedMimeType: req.file.mimetype,
        });
      }

      const result = await pdfParse(req.file.buffer);

      const fullText = result.text || "";

      return res.json({
        ok: true,
        filename: req.file.originalname,
        size: req.file.size,
        pageCount: result.numpages || 0,
        info: result.info || {},
        metadata: result.metadata || null,
        fullText,
        warning:
          fullText.trim().length === 0
            ? "No text found. This may be a scanned/image-based PDF that needs OCR."
            : null,
      });
    } catch (error) {
      console.error("FULL PDF TO TEXT ERROR:", error);

      return res.status(500).json({
        ok: false,
        error: "PDF text extraction failed.",
        details: error.message,
        stack: error.stack,
      });
    }
  }
);

app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err);

  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      ok: false,
      error: "Uploaded PDF is too large.",
      limit: MAX_PDF_BYTES,
    });
  }

  return res.status(err.status || 500).json({
    ok: false,
    error: "Request failed.",
    details: err.message,
    type: err.type,
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`PDF Tools API running on port ${PORT}`);
});