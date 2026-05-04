# HTML PDF API

A simple API-first HTML-to-PDF converter for Render.

## Endpoints

### Health check

```http
GET /health
```

### Convert HTML to PDF

```http
POST /api/html-to-pdf
x-api-key: YOUR_SECRET_KEY
Content-Type: application/json
```

Example body:

```json
{
  "html": "<html><body><h1>Hello PDF</h1></body></html>",
  "filename": "document.pdf",
  "options": {
    "format": "A4",
    "landscape": false,
    "printBackground": true,
    "scale": 1,
    "preferCSSPageSize": true,
    "margin": {
      "top": "10mm",
      "right": "10mm",
      "bottom": "10mm",
      "left": "10mm"
    }
  }
}
```

## Render setup

1. Create a Web Service on Render.
2. Connect this GitHub repo.
3. Use Docker as the runtime.
4. Add environment variable:

```env
PDF_API_KEY=your-secret-key
```

5. Deploy.

## Example JavaScript client

```js
const response = await fetch("https://YOUR-APP.onrender.com/api/html-to-pdf", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": "YOUR_SECRET_KEY"
  },
  body: JSON.stringify({
    html: "<html><body><h1>Hello PDF</h1></body></html>",
    filename: "hello.pdf",
    options: {
      format: "A4",
      printBackground: true
    }
  })
});

const blob = await response.blob();
```
