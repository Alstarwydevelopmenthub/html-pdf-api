const htmlInput = document.getElementById("htmlInput");
const apiKey = document.getElementById("apiKey");
const filename = document.getElementById("filename");
const format = document.getElementById("format");
const orientation = document.getElementById("orientation");
const convertBtn = document.getElementById("convertBtn");
const statusEl = document.getElementById("status");

htmlInput.value = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Sample PDF</title>
  <style>
    @page {
      size: A4;
      margin: 14mm;
    }

    body {
      font-family: Arial, sans-serif;
      color: #172033;
    }

    .invoice {
      border: 1px solid #d9dee8;
      border-radius: 14px;
      padding: 28px;
    }

    h1 {
      margin: 0 0 8px;
      font-size: 32px;
    }

    .muted {
      color: #697386;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 24px;
    }

    th, td {
      border-bottom: 1px solid #e5e8ef;
      padding: 12px;
      text-align: left;
    }

    th {
      background: #f5f7fb;
    }

    .total {
      text-align: right;
      font-weight: bold;
      font-size: 20px;
      margin-top: 22px;
    }
  </style>
</head>
<body>
  <div class="invoice">
    <h1>Sample Invoice</h1>
    <p class="muted">This sample tests CSS, tables, backgrounds, and print layout.</p>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Qty</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>HTML to PDF conversion</td>
          <td>1</td>
          <td>KES 5,000</td>
        </tr>
        <tr>
          <td>High quality browser rendering</td>
          <td>1</td>
          <td>KES 3,000</td>
        </tr>
      </tbody>
    </table>

    <p class="total">Total: KES 8,000</p>
  </div>
</body>
</html>`;

convertBtn.addEventListener("click", async () => {
  statusEl.textContent = "";

  if (!apiKey.value.trim()) {
    statusEl.textContent = "Enter your API key first.";
    return;
  }

  convertBtn.disabled = true;
  convertBtn.textContent = "Converting...";

  try {
    const response = await fetch("/api/html-to-pdf", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey.value.trim(),
      },
      body: JSON.stringify({
        html: htmlInput.value,
        filename: filename.value || "document.pdf",
        options: {
          format: format.value,
          landscape: orientation.value === "landscape",
          printBackground: true,
          scale: 1,
          preferCSSPageSize: true,
          margin: {
            top: "10mm",
            right: "10mm",
            bottom: "10mm",
            left: "10mm",
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Conversion failed");
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
    statusEl.textContent = "PDF generated successfully.";
  } catch (error) {
    statusEl.textContent = `Error: ${error.message}`;
  } finally {
    convertBtn.disabled = false;
    convertBtn.textContent = "Convert to PDF";
  }
});
