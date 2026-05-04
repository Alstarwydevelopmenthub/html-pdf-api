const express = require("express");
const { chromium } = require("playwright");

const app = express();

const PORT = process.env.PORT || 10000;
const PDF_API_KEY = process.env.PDF_API_KEY || "";
const MAX_HTML_BYTES = Number(process.env.MAX_HTML_BYTES || 2 * 1024 * 1024);

app.use(express.static("public"));

app.use(
  express.json({
    limit: `${Math.ceil(MAX_HTML_BYTES / 1024 / 1024)}mb`,
  })
);

function sanitizeFilename(name) {
  const fallback = "document.pdf";
  if (!name || typeof name !== "string") return fallback;

  const cleaned = name
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return fallback;
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

function requireApiKey(req, res, next) {
  if (!PDF_API_KEY) {
    return res.status(500).json({
      ok: false,
      error: "Server is missing PDF_API_KEY environment variable.",
    });
  }

  const providedKey = req.header("x-api-key");
  if (!providedKey || providedKey !== PDF_API_KEY) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized. Missing or invalid x-api-key header.",
    });
  }

  next();
}

function buildPdfOptions(options = {}) {
  const safeOptions = {};

  const allowedFormats = new Set(["A4", "A3", "A5", "Letter", "Legal", "Tabloid"]);
  safeOptions.format = allowedFormats.has(options.format) ? options.format : "A4";

  safeOptions.landscape = Boolean(options.landscape);
  safeOptions.printBackground = options.printBackground !== false;

  const scale = Number(options.scale);
  safeOptions.scale = Number.isFinite(scale) && scale >= 0.1 && scale <= 2 ? scale : 1;

  const defaultMargin = {
    top: "10mm",
    right: "10mm",
    bottom: "10mm",
    left: "10mm",
  };

  safeOptions.margin = {
    top: options.margin?.top || defaultMargin.top,
    right: options.margin?.right || defaultMargin.right,
    bottom: options.margin?.bottom || defaultMargin.bottom,
    left: options.margin?.left || defaultMargin.left,
  };

  if (typeof options.preferCSSPageSize === "boolean") {
    safeOptions.preferCSSPageSize = options.preferCSSPageSize;
  } else {
    safeOptions.preferCSSPageSize = true;
  }

  return safeOptions;
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "html-pdf-api",
    status: "running",
  });
});

app.post("/api/html-to-pdf", requireApiKey, async (req, res) => {
  const startedAt = Date.now();

  try {
    const { html, filename, options } = req.body || {};

    if (!html || typeof html !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Missing required field: html must be a string.",
      });
    }

    const htmlBytes = Buffer.byteLength(html, "utf8");
    if (htmlBytes > MAX_HTML_BYTES) {
      return res.status(413).json({
        ok: false,
        error: `HTML is too large. Maximum allowed size is ${MAX_HTML_BYTES} bytes.`,
      });
    }

    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });

    let pdfBuffer;

    try {
      const page = await browser.newPage();

      await page.setContent(html, {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      await page.emulateMedia({ media: "print" });

      pdfBuffer = await page.pdf(buildPdfOptions(options));
    } finally {
      await browser.close();
    }

    const safeFilename = sanitizeFilename(filename);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
    res.setHeader("X-Conversion-Time-Ms", String(Date.now() - startedAt));
    res.send(pdfBuffer);
  } catch (error) {
    console.error("PDF conversion error:", error);
    res.status(500).json({
      ok: false,
      error: "PDF conversion failed.",
      details: process.env.NODE_ENV === "production" ? undefined : error.message,
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`HTML PDF API running on port ${PORT}`);
});
