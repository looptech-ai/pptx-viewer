<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/looptech-logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/looptech-logo.png">
    <img src="assets/looptech-logo.png" alt="LoopTech" width="300">
  </picture>
</p>

<h1 align="center">PPTX Viewer</h1>

<p align="center">
  Self-hosted PowerPoint viewing for web applications, agent chat interfaces, and embedded contexts.
</p>

---

## Overview

Displaying PowerPoint files in web applications is surprisingly difficult. Microsoft's embedded viewer is blocked for enterprise accounts, and HTML conversion libraries lose formatting. This project demonstrates how to use **ONLYOFFICE** or **Collabora Online** to render PPTX files with high fidelity.

### When to Use This Approach

- Embedding presentations in **agent chat interfaces** or AI assistants
- Building **document viewing portals** for enterprise applications
- Displaying **AI-generated presentations** inline
- Any context where **Microsoft's embed restrictions** are a problem

### Limitations

Both viewers render slides as **static content** - no video playback, animations, or audio.

## Quick Start

```bash
# Start ONLYOFFICE
docker run -d --name onlyoffice -p 8080:80 \
  -e JWT_ENABLED=false \
  -e ALLOW_PRIVATE_IP_ADDRESS=true \
  -e ALLOW_META_IP_ADDRESS=true \
  onlyoffice/documentserver:latest

# Wait ~60 seconds for initialization, then verify
curl http://localhost:8080/healthcheck  # Returns "true"
```

```bash
# Start the backend and frontend
cd backend && npm install && npm run dev &
cd frontend && npm install && npm run dev
```

Open http://localhost:5173, upload a PPTX, and view it.

## How It Works

```
Browser                    Backend                   ONLYOFFICE
   │                          │                          │
   ├── Upload PPTX ──────────►│                          │
   │                          ├── Store file             │
   │                          │                          │
   ├── Request viewer ───────►│                          │
   │                          ├── Generate config ──────►│
   │◄─── iframe URL ──────────┤                          │
   │                          │                          │
   ├── Load iframe ───────────┼─────────────────────────►│
   │                          │◄─── Fetch PPTX ──────────┤
   │◄─── Rendered slides ─────┼──────────────────────────┤
```

ONLYOFFICE fetches the file via URL and renders it using its OOXML engine. Collabora uses the WOPI protocol instead (your backend proxies the file).

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture Guide](docs/ARCHITECTURE.md) | Enterprise deployment, Kubernetes, S3 integration, security |
| [Alternative Approaches](docs/ALTERNATIVES.md) | Why Microsoft embed and HTML conversion don't work |

## File Access Options

ONLYOFFICE can fetch files from any URL it can reach:

| Source | Works? | Notes |
|--------|--------|-------|
| Local backend | ✅ | Use `host.docker.internal` from Docker |
| S3 presigned URL | ✅ | Generate URL, pass to ONLYOFFICE |
| Public URL | ✅ | Direct access |
| CDN | ✅ | With signed URLs |

See [Architecture Guide](docs/ARCHITECTURE.md#url-based-file-access) for implementation details.

## Project Structure

```
pptx-viewer/
├── backend/           # Express server (upload, ONLYOFFICE config, WOPI)
├── frontend/          # React app with viewer tabs
├── docs/
│   ├── ARCHITECTURE.md   # Enterprise deployment guide
│   └── ALTERNATIVES.md   # Why other approaches don't work
└── assets/            # LoopTech branding
```

## License

- ONLYOFFICE Community Edition: AGPL 3.0
- Collabora CODE: MPL 2.0

---

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/looptech-logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/looptech-logo.png">
    <img src="assets/looptech-logo.png" alt="LoopTech" width="150">
  </picture>
</p>
