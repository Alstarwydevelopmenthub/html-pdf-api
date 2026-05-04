const express = require("express");
const { chromium } = require("playwright");

const app = express();

const PORT = process.env.PORT || 10000;
const PDF_API_KEY = process.env.PDF_API_KEY || "";
const MAX_HTML_BYTES = Number(process.env.MAX_HTML_BYTES || 10 * 1024 * 1024);

// Serve test UI
app.use(express.static("public"));

// Accept JSON up to 10MB
app.use(
  express.json({
    limit: "10mb",
  })
);

// Accept raw HTML too
app.use(
  express.text({
    type: ["text/html", "text/plain"],
    limit: "10mb",
  })
);

function sanitizeFilename(name) {
  if (!name || typeof name !== "string") return "document.pdf";

  const cleaned = name
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "document.pdf";
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

function requireApiKey(req, res, next) {
  if (!PDF_API_KEY) {
    return res.status(500).json({
      ok: false,
      error: "PDF_API_KEY is missing in Render environment variables.",
    });
  }

  const providedKey = req.header("x-api-key");

  if (!providedKey || providedKey !== PDF_API_KEY) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized. Missing or invalid x-api-key.",
    });
  }

  next();
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

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "html-pdf-api",
    status: "running",
  });
});

app.post("/api/html-to-pdf", requireApiKey, async (req, res) => {
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
        error: `HTML too large. Size is ${size} bytes. Limit is ${MAX_HTML_BYTES} bytes.`,
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
    console.error("FULL PDF ERROR:", error);

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

// Better body parser error display
app.use((err, req, res, next) => {
  console.error("BODY PARSER ERROR:", err);

  return res.status(err.status || 500).json({
    ok: false,
    error: "Request body error.",
    details: err.message,
    type: err.type,
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`HTML PDF API running on port ${PORT}`);
});