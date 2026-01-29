<p align="center">
  <img src="assets/looptech-logo.png" alt="LoopTech" width="200">
</p>

<h1 align="center">PPTX Viewer</h1>

<p align="center">
  <strong>A LoopTech Labs Proof of Concept</strong><br>
  Self-hosted PowerPoint viewing using ONLYOFFICE or Collabora Online
</p>

---

## Overview

This project demonstrates how to upload and display PowerPoint files (.pptx) in a web application with high fidelity rendering, without sending data to external services.

### Key Features

- **High fidelity** - ONLYOFFICE and Collabora render PPTX files accurately
- **Self-hosted** - All data stays on your infrastructure
- **Two viewer options** - ONLYOFFICE (best compatibility) and Collabora Online (LibreOffice-based)
- **No external dependencies** - Everything runs locally via Docker

### Limitations

Both ONLYOFFICE and Collabora render presentations as **static slides**. The following features are **not supported**:

| Feature | ONLYOFFICE | Collabora | Notes |
|---------|------------|-----------|-------|
| Embedded videos | ❌ | ❌ | Shows placeholder/thumbnail only |
| Video playback | ❌ | ❌ | No playback capability |
| Animations | ❌ | ❌ | Slides render in final state |
| Transitions | ⚠️ Limited | ⚠️ Limited | Basic only |
| Embedded audio | ❌ | ❌ | No playback |
| Narration | ❌ | ❌ | Not supported |

**If you need multimedia playback**, consider:
- Microsoft's embed viewer (see limitations below)
- Google Slides import (converts PPTX, may lose fidelity)
- Custom player that extracts media from PPTX and plays alongside slides

### Why Not Microsoft's Embedded Viewer?

Microsoft offers an embedded PowerPoint viewer that supports animations, videos, and transitions. However, it has significant limitations for enterprise use:

#### Personal OneDrive (Works with Limitations)

For **personal** OneDrive accounts, you can embed presentations using:

```html
<iframe src="https://onedrive.live.com/embed?resid=FILE_ID&authkey=AUTH_KEY"
        width="800" height="600" frameborder="0">
</iframe>
```

**Limitations:**
- File must be publicly shared or have a shareable link
- Data is processed through Microsoft's servers
- Requires internet connectivity to Microsoft services

#### OneDrive for Business / SharePoint (Blocked)

For **enterprise** OneDrive for Business and SharePoint accounts, iframe embedding is **blocked by default**:

- **Content Security Policy (CSP)**: Microsoft sets `X-Frame-Options: SAMEORIGIN` on SharePoint/OneDrive for Business, preventing embedding in third-party applications
- **Tenant restrictions**: Even with Microsoft Graph API access to files, the embed URLs return CSP errors when loaded in iframes outside of Microsoft's domains
- **No workaround**: Unlike personal accounts, there's no embed endpoint that bypasses these restrictions for Business accounts

```
# Typical error when trying to iframe SharePoint/OneDrive for Business:
Refused to display 'https://company.sharepoint.com/...' in a frame
because it set 'X-Frame-Options' to 'sameorigin'.
```

#### Microsoft Graph API

The Microsoft Graph API can retrieve file metadata and download URLs, but:

- Download URLs are for downloading the file, not viewing it
- There's no "viewer URL" endpoint that returns an embeddable frame for Business accounts
- Preview URLs (`/preview` endpoint) still enforce the same CSP restrictions

#### Summary: When Microsoft Embed Works

| Scenario | Embeddable? | Notes |
|----------|-------------|-------|
| Personal OneDrive (public link) | ✅ Yes | Use embed URL |
| Personal OneDrive (private) | ❌ No | Requires auth |
| OneDrive for Business | ❌ No | CSP blocks iframe |
| SharePoint Online | ❌ No | CSP blocks iframe |
| SharePoint On-Premises | ⚠️ Maybe | Depends on admin config |

**This is why we built this proof of concept** - to provide a self-hosted alternative for organizations that need to embed PowerPoint viewing in their applications without relying on Microsoft's embedding restrictions.

### Why Not HTML Conversion Libraries?

Several JavaScript libraries exist that convert PPTX files to HTML for browser display (e.g., `pptx-preview`, `pptx2html`). While these offer a simpler deployment model (no Docker containers), they have significant limitations:

#### What Gets Lost in HTML Conversion

| Feature | Preserved? | Notes |
|---------|------------|-------|
| Basic text | ✅ Mostly | Font substitution may occur |
| Simple shapes | ⚠️ Partial | Complex shapes may render incorrectly |
| Images | ✅ Yes | Usually preserved |
| Charts | ❌ Often broken | Complex charts may not render |
| SmartArt | ❌ Usually broken | Converts poorly |
| Custom fonts | ❌ No | Falls back to system fonts |
| Precise positioning | ⚠️ Approximate | Layout shifts are common |
| Slide masters/themes | ⚠️ Partial | May lose styling |
| Animations | ❌ No | Not converted |
| Transitions | ❌ No | Not converted |
| Videos/Audio | ❌ No | Not converted |
| 3D effects | ❌ No | Not supported |
| Gradients | ⚠️ Partial | Simple gradients only |

#### The Fidelity Problem

PowerPoint's OOXML format is extremely complex. HTML conversion libraries essentially:

1. Parse the XML structure
2. Attempt to map PowerPoint elements to HTML/CSS equivalents
3. Render using browser capabilities

This mapping is **lossy by design** - HTML/CSS simply cannot represent all PowerPoint features. The result is often presentations that look "close" but have noticeable differences:

- Text wrapping behaves differently
- Spacing and margins shift
- Colors may not match exactly (color space differences)
- Complex layouts break down

#### When HTML Conversion Makes Sense

- Quick previews where fidelity isn't critical
- Simple presentations with basic text and images
- Environments where Docker isn't available
- Thumbnail generation

#### Why ONLYOFFICE/Collabora Are Different

ONLYOFFICE and Collabora don't convert to HTML - they use **actual office suite rendering engines**:

- **ONLYOFFICE**: Custom OOXML engine built specifically for Office formats
- **Collabora**: LibreOffice's rendering engine (which handles OOXML natively)

These engines interpret the PPTX format directly, providing much higher fidelity than HTML conversion. The tradeoff is infrastructure complexity (Docker containers, more memory).

## Quick Start

### Prerequisites

- Docker Desktop
- Node.js 18+
- npm

### 1. Start the Document Servers

```bash
# Start ONLYOFFICE (port 8080)
docker run -d --name onlyoffice -p 8080:80 \
  -e JWT_ENABLED=false \
  -e ALLOW_PRIVATE_IP_ADDRESS=true \
  -e ALLOW_META_IP_ADDRESS=true \
  onlyoffice/documentserver:latest

# Start Collabora Online (port 9980)
docker run -d --name collabora -p 9980:9980 \
  -e "aliasgroup1=http://host.docker.internal:3001" \
  -e "extra_params=--o:ssl.enable=false --o:ssl.termination=false" \
  --cap-add MKNOD \
  collabora/code:latest

# Wait for services to initialize (~60 seconds)
sleep 60

# Verify they're running
curl http://localhost:8080/healthcheck  # Should return "true"
curl http://localhost:9980/hosting/discovery | head -3  # Should return XML
```

### 2. Start the Backend

```bash
cd backend
npm install
npm run dev
```

Backend runs on http://localhost:3001

### 3. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on http://localhost:5173 (or specify `--port XXXX`)

### 4. Use the Application

1. Open the frontend URL in your browser
2. Upload a .pptx file
3. Click "ONLYOFFICE" or "Collabora Online" tab to view

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              React Frontend (port 5173)                  │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │   │
│  │  │   Upload    │  │  ONLYOFFICE │  │    Collabora    │  │   │
│  │  │   Zone      │  │   iframe    │  │     iframe      │  │   │
│  │  └─────────────┘  └──────┬──────┘  └────────┬────────┘  │   │
│  └──────────────────────────┼──────────────────┼───────────┘   │
└─────────────────────────────┼──────────────────┼───────────────┘
                              │                  │
                              ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Express Backend (port 3001)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   File      │  │  ONLYOFFICE │  │      WOPI Host          │ │
│  │   Upload    │  │   Config    │  │  (for Collabora)        │ │
│  │   /api/     │  │   /api/     │  │  /api/wopi/             │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│                          │                    │                 │
│                    /files/ (static)           │                 │
└──────────────────────────┼────────────────────┼─────────────────┘
                           │                    │
          ┌────────────────┴──────┐   ┌────────┴────────┐
          ▼                       ▼   ▼                 ▼
┌─────────────────────┐    ┌─────────────────────────────────┐
│   ONLYOFFICE        │    │      Collabora Online           │
│   Document Server   │    │      (LibreOffice engine)       │
│   (port 8080)       │    │      (port 9980)                │
│                     │    │                                 │
│   Docker Container  │    │      Docker Container           │
└─────────────────────┘    └─────────────────────────────────┘
```

## API Reference

### File Upload

```
POST /api/upload
Content-Type: multipart/form-data

Request:
  file: <binary pptx data>

Response:
{
  "success": true,
  "file": {
    "id": "uuid",
    "originalName": "presentation.pptx",
    "filename": "uuid.pptx",
    "size": 12345,
    "uploadedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### List Files

```
GET /api/files

Response:
[
  { "id": "...", "originalName": "...", ... }
]
```

### ONLYOFFICE Config

```
GET /api/onlyoffice/config/:fileId

Response:
{
  "document": {
    "fileType": "pptx",
    "key": "unique-key",
    "title": "presentation.pptx",
    "url": "http://host.docker.internal:3001/files/uuid.pptx"
  },
  "editorConfig": {
    "mode": "view",
    ...
  }
}
```

### Collabora Editor URL

```
GET /api/collabora/editor-url/:fileId

Response:
{
  "editorUrl": "http://localhost:9980/browser/dist/cool.html?WOPISrc=...",
  "wopiSrc": "http://host.docker.internal:3001/api/wopi/files/uuid"
}
```

### WOPI Endpoints (for Collabora)

```
GET /api/wopi/files/:fileId           # CheckFileInfo
GET /api/wopi/files/:fileId/contents  # GetFile
POST /api/wopi/files/:fileId/contents # PutFile (if editing enabled)
```

## Accessing Files via URL

Both ONLYOFFICE and Collabora can load files from remote URLs, including S3 presigned URLs. This is useful when files are stored in cloud storage rather than locally.

### How It Works

- **ONLYOFFICE**: Fetches the file directly from the URL specified in the config's `document.url` field
- **Collabora**: Uses WOPI protocol - your backend fetches the file and serves it via WOPI endpoints

### Testing with a Public URL

You can test with any publicly accessible PPTX file:

```bash
# 1. Start ONLYOFFICE (if not already running)
docker run -d --name onlyoffice -p 8080:80 \
  -e JWT_ENABLED=false \
  onlyoffice/documentserver:latest

# 2. Wait for initialization (~60 seconds)
sleep 60

# 3. Create a test HTML file
cat > /tmp/test-url.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
  <title>ONLYOFFICE URL Test</title>
  <style>html, body { margin: 0; height: 100%; }</style>
</head>
<body>
  <div id="placeholder" style="height: 100%;"></div>
  <script src="http://localhost:8080/web-apps/apps/api/documents/api.js"></script>
  <script>
    new DocsAPI.DocEditor('placeholder', {
      document: {
        fileType: 'pptx',
        key: 'test-' + Date.now(),
        title: 'Sample Presentation',
        // Replace with any public PPTX URL
        url: 'https://calibre-ebook.com/downloads/demos/demo.pptx'
      },
      editorConfig: {
        mode: 'view'
      }
    });
  </script>
</body>
</html>
EOF

# 4. Open in browser
open /tmp/test-url.html  # macOS
# Or: xdg-open /tmp/test-url.html  # Linux
```

### Testing with S3 Presigned URL

Generate a presigned URL from S3 and use it the same way:

```javascript
// Node.js example to generate presigned URL
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: 'us-east-1' });

const presignedUrl = await getSignedUrl(s3, new GetObjectCommand({
  Bucket: 'my-bucket',
  Key: 'presentations/demo.pptx'
}), { expiresIn: 3600 }); // 1 hour

// Use this URL in the ONLYOFFICE config
const config = {
  document: {
    fileType: 'pptx',
    key: 'unique-key-' + Date.now(),
    title: 'My Presentation',
    url: presignedUrl  // S3 presigned URL works here
  },
  editorConfig: { mode: 'view' }
};
```

### Important: Docker Network Access

When running in Docker, the document server needs to reach the file URL:

| URL Type | Docker Access | Notes |
|----------|---------------|-------|
| `http://localhost:*` | Won't work | Use `host.docker.internal` instead |
| `http://host.docker.internal:*` | Works | Docker's host access |
| `https://s3.amazonaws.com/*` | Works | Public internet |
| `https://your-cdn.com/*` | Works | Public internet |
| Private S3 endpoints | May need VPC config | Depends on network setup |

### Quick Test: Verify URL Access from Docker

```bash
# Test if ONLYOFFICE can reach a URL
docker exec onlyoffice curl -I "https://calibre-ebook.com/downloads/demos/demo.pptx"

# Test host.docker.internal access
docker exec onlyoffice curl -I "http://host.docker.internal:3001/files/test.pptx"
```

## Viewer Comparison

| Feature | ONLYOFFICE | Collabora Online |
|---------|------------|------------------|
| Rendering Engine | Custom OOXML | LibreOffice |
| PPTX Compatibility | Excellent | Very Good |
| License | AGPL 3.0 | MPL 2.0 |
| Memory Usage | ~500MB | ~300MB |
| Startup Time | ~30s | ~20s |
| Edit Support | Yes | Yes |
| Animations | No | No |
| Video/Audio | No | No |

## Troubleshooting

### ONLYOFFICE: "Download failed"

ONLYOFFICE blocks private IPs by default. Start with:
```bash
-e ALLOW_PRIVATE_IP_ADDRESS=true
-e ALLOW_META_IP_ADDRESS=true
```

### Collabora: "Failed to establish socket connection"

1. Check aliasgroup is set correctly
2. Remove `sandbox` attribute from iframe
3. Ensure WOPI endpoints are accessible from Docker

### File not loading

1. Verify file exists: `curl http://localhost:3001/files/<filename>`
2. Check Docker can reach host: `docker exec <container> curl http://host.docker.internal:3001/`

### CORS errors

Ensure your frontend origin is in the backend's CORS config:
```javascript
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5555'],
  credentials: true
}));
```

## Security Considerations

- **JWT**: Enable JWT for ONLYOFFICE in production (`JWT_ENABLED=true`)
- **SSL/TLS**: Use HTTPS for all services in production
- **WOPI Tokens**: Implement access token validation for Collabora
- **File Validation**: Validate uploaded files (type, size, content)
- **Network Isolation**: Run document servers in isolated networks

## Project Structure

```
pptx-viewer/
├── README.md                 # This file
├── docker-compose.yml        # Docker setup for all services
├── backend/                  # Express API server
│   ├── server.js            # Main server with upload + WOPI
│   └── package.json
├── frontend/                 # React viewer app
│   ├── src/App.tsx          # Main viewer with ONLYOFFICE/Collabora
│   └── public/onlyoffice.html
└── docs/
    └── ARCHITECTURE.md      # Enterprise deployment guide
```

## License

- ONLYOFFICE Community Edition: AGPL 3.0
- Collabora CODE: MPL 2.0

---

<p align="center">
  <img src="assets/looptech-logo.png" alt="LoopTech" width="120"><br>
  <strong>LoopTech Labs</strong><br>
  <em>Exploring ideas, building prototypes</em>
</p>
