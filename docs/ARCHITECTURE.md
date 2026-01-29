# Enterprise Architecture Guide

This document outlines how to deploy the PPTX Viewer system for enterprise or customer-facing applications.

## Table of Contents

1. [System Overview](#system-overview)
2. [Deployment Options](#deployment-options)
3. [Integration Patterns](#integration-patterns)
4. [Serving AI-Generated Presentations](#serving-ai-generated-presentations)
5. [Scaling Considerations](#scaling-considerations)
6. [Security Architecture](#security-architecture)

---

## System Overview

### Core Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Client Layer                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │   Web App        │  │   Mobile App     │  │   Embedded Widget    │  │
│  │   (React/Vue)    │  │   (WebView)      │  │   (iframe)           │  │
│  └────────┬─────────┘  └────────┬─────────┘  └──────────┬───────────┘  │
└───────────┼─────────────────────┼────────────────────────┼──────────────┘
            │                     │                        │
            ▼                     ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           API Gateway / Load Balancer                    │
│                        (nginx / AWS ALB / Cloudflare)                    │
└─────────────────────────────────────────────────────────────────────────┘
            │                     │                        │
            ▼                     ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Application Layer                              │
│  ┌──────────────────────────────────┐  ┌────────────────────────────┐  │
│  │   API Server                     │  │   WOPI Host                │  │
│  │   (Express/FastAPI)              │  │   (File serving +          │  │
│  │   - File upload                  │  │    WOPI protocol)          │  │
│  │   - Viewer config generation     │  │                            │  │
│  └────────┬─────────────────────────┘  └──────────┬─────────────────┘  │
└───────────┼──────────────────────────────────────┼──────────────────────┘
            │                                       │
            ▼                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Document Rendering Layer                       │
│  ┌──────────────────────────────┐  ┌────────────────────────────────┐  │
│  │      ONLYOFFICE Cluster      │  │      Collabora Cluster         │  │
│  │  ┌────────┐ ┌────────┐       │  │  ┌────────┐ ┌────────┐         │  │
│  │  │ Node 1 │ │ Node 2 │ ...   │  │  │ Node 1 │ │ Node 2 │ ...     │  │
│  │  └────────┘ └────────┘       │  │  └────────┘ └────────┘         │  │
│  └──────────────────────────────┘  └────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
            │                     │                        │
            ▼                     ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Storage Layer                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │   Object Storage │  │   Database       │  │   Cache              │  │
│  │   (S3/Azure/GCS) │  │   (PostgreSQL)   │  │   (Redis)            │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. User uploads PPTX file
                    │
                    ▼
2. File stored in Object Storage (S3/Azure Blob)
                    │
                    ▼
3. Metadata stored in Database
                    │
                    ▼
4. Client requests viewer URL
                    │
                    ▼
5. API returns signed URL + viewer config
                    │
                    ▼
6. Client loads iframe with document server
                    │
                    ▼
7. Document server fetches file via WOPI/direct URL
                    │
                    ▼
8. Document rendered in browser
```

---

## Deployment Options

### Option 1: Single Server (Development/Small Scale)

```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: ./app
    ports:
      - "3001:3001"
    environment:
      - STORAGE_TYPE=local
      - ONLYOFFICE_URL=http://onlyoffice:80
    volumes:
      - ./uploads:/app/uploads

  onlyoffice:
    image: onlyoffice/documentserver
    ports:
      - "8080:80"
    environment:
      - JWT_ENABLED=true
      - JWT_SECRET=${JWT_SECRET}
```

**Suitable for**: < 50 concurrent users

### Option 2: Kubernetes Cluster (Production)

```yaml
# onlyoffice-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: onlyoffice
spec:
  replicas: 3
  selector:
    matchLabels:
      app: onlyoffice
  template:
    spec:
      containers:
      - name: onlyoffice
        image: onlyoffice/documentserver
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        env:
        - name: JWT_ENABLED
          value: "true"
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: onlyoffice-secrets
              key: jwt-secret
---
apiVersion: v1
kind: Service
metadata:
  name: onlyoffice
spec:
  selector:
    app: onlyoffice
  ports:
  - port: 80
    targetPort: 80
  type: ClusterIP
```

**Suitable for**: 50-1000+ concurrent users

### Option 3: Managed Services

| Provider | Service | Notes |
|----------|---------|-------|
| ONLYOFFICE | ONLYOFFICE Docs Cloud | Managed hosting |
| Collabora | Collabora Online | CODE for self-hosted, Partners for managed |
| AWS | WorkDocs | Limited customization |

---

## Integration Patterns

### Pattern 1: Direct Embedding (Simple)

User uploads file → Store → Generate viewer URL → Embed iframe

```typescript
// Frontend
const viewerUrl = await api.getViewerUrl(fileId);
return <iframe src={viewerUrl} />;
```

### Pattern 2: URL-Based Viewing

User provides URL → Fetch file → Store temporarily → Display

```typescript
// Backend
app.post('/api/view-url', async (req, res) => {
  const { url } = req.body;
  const file = await fetch(url);
  const tempId = await storage.saveTemp(file, ttl: '1h');
  res.json({ viewerUrl: getViewerUrl(tempId) });
});
```

### Pattern 3: Hybrid (Edit + View)

```typescript
// Switch between view and edit modes
const config = {
  document: { url: fileUrl },
  editorConfig: {
    mode: userCanEdit ? 'edit' : 'view',
    callbackUrl: '/api/save-callback'
  }
};
```

---

## URL-Based File Access

Both ONLYOFFICE and Collabora can access files via URLs rather than local storage. This section covers direct URLs, S3, and CDN integration.

### How Each Platform Accesses Files

| Platform | Access Method | URL Provided By |
|----------|---------------|-----------------|
| ONLYOFFICE | Direct HTTP fetch | `document.url` in config |
| Collabora | WOPI protocol | Your backend serves file via `/wopi/files/:id/contents` |

### ONLYOFFICE: Direct URL Access

ONLYOFFICE fetches files directly from the URL you provide. The document server makes an HTTP GET request to download the file.

```typescript
// Backend: Generate config with any accessible URL
app.get('/api/onlyoffice/config-from-url', (req, res) => {
  const { url, filename } = req.query;

  res.json({
    document: {
      fileType: 'pptx',
      key: `doc-${Date.now()}`,  // Must be unique per document version
      title: filename || 'Presentation.pptx',
      url: url  // Any URL ONLYOFFICE can reach
    },
    editorConfig: {
      mode: 'view',
      lang: 'en'
    }
  });
});
```

### Collabora: WOPI Protocol

Collabora uses WOPI (Web Application Open Platform Interface). Your backend acts as a WOPI host that fetches and serves the file.

```typescript
// Backend: WOPI host that proxies from any URL
const fileRegistry = new Map();  // fileId -> { url, filename, size }

// Register a URL for viewing
app.post('/api/collabora/register-url', async (req, res) => {
  const { url, filename } = req.body;
  const fileId = uuid();

  // Fetch file info (HEAD request for size)
  const headRes = await fetch(url, { method: 'HEAD' });
  const size = parseInt(headRes.headers.get('content-length') || '0');

  fileRegistry.set(fileId, { url, filename, size });

  const wopiSrc = `http://host.docker.internal:3001/api/wopi/files/${fileId}`;
  const editorUrl = `http://localhost:9980/browser/dist/cool.html?WOPISrc=${encodeURIComponent(wopiSrc)}`;

  res.json({ fileId, editorUrl });
});

// WOPI CheckFileInfo - returns file metadata
app.get('/api/wopi/files/:fileId', (req, res) => {
  const file = fileRegistry.get(req.params.fileId);
  if (!file) return res.status(404).json({ error: 'Not found' });

  res.json({
    BaseFileName: file.filename,
    Size: file.size,
    UserId: 'user-1',
    UserCanWrite: false
  });
});

// WOPI GetFile - streams file content from source URL
app.get('/api/wopi/files/:fileId/contents', async (req, res) => {
  const file = fileRegistry.get(req.params.fileId);
  if (!file) return res.status(404).json({ error: 'Not found' });

  // Fetch from source and pipe to response
  const fileRes = await fetch(file.url);
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  fileRes.body.pipe(res);
});
```

### S3 Integration

#### Option 1: S3 Presigned URLs (Recommended for ONLYOFFICE)

Generate temporary signed URLs that ONLYOFFICE can fetch directly:

```typescript
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

app.get('/api/onlyoffice/config/:fileId', async (req, res) => {
  const { fileId } = req.params;

  // Get file metadata from your database
  const file = await db.files.findById(fileId);

  // Generate presigned URL (valid for 1 hour)
  const presignedUrl = await getSignedUrl(s3, new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: file.s3Key
  }), { expiresIn: 3600 });

  res.json({
    document: {
      fileType: 'pptx',
      key: `${fileId}-${file.version}`,
      title: file.originalName,
      url: presignedUrl  // ONLYOFFICE fetches directly from S3
    },
    editorConfig: { mode: 'view' }
  });
});
```

#### Option 2: Backend Proxy (Required for Collabora, Optional for ONLYOFFICE)

Your backend fetches from S3 and serves to the document server:

```typescript
// For Collabora WOPI or if you need to add custom headers/auth
app.get('/api/wopi/files/:fileId/contents', async (req, res) => {
  const file = await db.files.findById(req.params.fileId);

  const s3Response = await s3.send(new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: file.s3Key
  }));

  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  res.set('Content-Length', s3Response.ContentLength);
  s3Response.Body.pipe(res);
});
```

### CDN Integration

For high-traffic deployments, serve files through a CDN:

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │────▶│   CDN    │────▶│  Origin  │────▶│    S3    │
│          │     │(CloudFront)    │  (API)   │     │          │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                      │
                      ▼
              ONLYOFFICE fetches
              from CDN URL
```

```typescript
// Generate CDN URL with signed cookie or token
app.get('/api/onlyoffice/config/:fileId', async (req, res) => {
  const file = await db.files.findById(req.params.fileId);

  // CloudFront signed URL
  const cdnUrl = getSignedCloudFrontUrl({
    url: `https://cdn.example.com/files/${file.s3Key}`,
    dateLessThan: new Date(Date.now() + 3600 * 1000),
    privateKey: process.env.CLOUDFRONT_PRIVATE_KEY,
    keyPairId: process.env.CLOUDFRONT_KEY_PAIR_ID
  });

  res.json({
    document: {
      fileType: 'pptx',
      key: `${fileId}-${file.version}`,
      title: file.originalName,
      url: cdnUrl
    },
    editorConfig: { mode: 'view' }
  });
});
```

### Network Considerations

#### Docker Networking

| Scenario | URL Format | Notes |
|----------|------------|-------|
| File on host machine | `http://host.docker.internal:3001/files/...` | Use `host.docker.internal` |
| File on public internet | `https://example.com/file.pptx` | Works directly |
| File in same Docker network | `http://service-name:port/...` | Use Docker service name |
| S3 (public bucket) | `https://bucket.s3.region.amazonaws.com/...` | Works directly |
| S3 (presigned) | `https://bucket.s3.region.amazonaws.com/...?X-Amz-...` | Works directly |

#### Firewall/Security Groups

Ensure your document server can reach:
- Your backend API (for local files)
- S3 endpoints (for direct S3 access)
- CDN endpoints (for CDN-served files)

```bash
# Test connectivity from ONLYOFFICE container
docker exec onlyoffice curl -I "https://your-bucket.s3.amazonaws.com/test.pptx?presigned-params"
```

### URL Access Comparison

| Approach | ONLYOFFICE | Collabora | Pros | Cons |
|----------|------------|-----------|------|------|
| Direct S3 presigned URL | ✅ Direct | ❌ Needs proxy | Simple, fast | URL expires |
| Backend proxy | ✅ Works | ✅ Required | Full control, auth | Extra hop |
| CDN with signed URL | ✅ Direct | ❌ Needs proxy | Fast, cached | CDN setup required |
| Public URL | ✅ Direct | ❌ Needs proxy | Simplest | No auth |

### Complete Example: S3 + ONLYOFFICE

```typescript
// Full working example
import express from 'express';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuid } from 'uuid';

const app = express();
const s3 = new S3Client({ region: 'us-east-1' });

// Upload file to S3
app.post('/api/upload', async (req, res) => {
  const fileId = uuid();
  const s3Key = `presentations/${fileId}.pptx`;

  await s3.send(new PutObjectCommand({
    Bucket: 'my-presentations',
    Key: s3Key,
    Body: req.body,
    ContentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  }));

  // Save metadata to database
  await db.files.create({ id: fileId, s3Key, createdAt: new Date() });

  res.json({ fileId });
});

// Get viewer config with S3 presigned URL
app.get('/api/onlyoffice/config/:fileId', async (req, res) => {
  const file = await db.files.findById(req.params.fileId);

  const presignedUrl = await getSignedUrl(s3, new GetObjectCommand({
    Bucket: 'my-presentations',
    Key: file.s3Key
  }), { expiresIn: 3600 });

  res.json({
    document: {
      fileType: 'pptx',
      key: `${file.id}-${Date.now()}`,
      title: 'Presentation.pptx',
      url: presignedUrl
    },
    editorConfig: { mode: 'view' }
  });
});

app.listen(3001);
```

---

## Serving AI-Generated Presentations

This section covers how enterprises can integrate ONLYOFFICE or Collabora to display PowerPoint files generated by AI systems.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AI Presentation Pipeline                          │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   User       │────▶│   AI Model   │────▶│   PPTX       │────▶│   Document   │
│   Request    │     │   (Claude/   │     │   Generator  │     │   Server     │
│              │     │    GPT)      │     │   (PptxGenJS)│     │   (viewer)   │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                            │                    │                    │
                            ▼                    ▼                    ▼
                     Slide content        .pptx binary         Rendered view
                     as JSON              file                 in browser
```

### Step 1: AI Generates Slide Content

Your AI system produces structured slide content:

```typescript
interface Slide {
  title: string;
  bullets: string[];
  notes?: string;
  imageUrl?: string;
}

// Example: Call Claude API to generate slide content
async function generateSlideContent(prompt: string): Promise<Slide[]> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Create a presentation outline for: "${prompt}"

      Return JSON array of slides:
      [{ "title": "...", "bullets": ["...", "..."], "notes": "..." }]

      Include 5-8 slides with clear, concise content.`
    }]
  });

  return JSON.parse(response.content[0].text);
}
```

### Step 2: Convert to PPTX File

Use a library to convert the structured content into a valid .pptx file:

**JavaScript/Node.js (PptxGenJS)**:
```typescript
import PptxGenJS from 'pptxgenjs';

async function createPptx(slides: Slide[]): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.author = 'AI Presentation Generator';
  pptx.title = slides[0]?.title || 'Presentation';

  slides.forEach((slide, index) => {
    const s = pptx.addSlide();

    // Title
    s.addText(slide.title, {
      x: 0.5, y: 0.5, w: '90%', h: 1,
      fontSize: 32, bold: true, color: '363636'
    });

    // Bullets
    s.addText(
      slide.bullets.map(b => ({ text: b, options: { bullet: true } })),
      { x: 0.5, y: 1.8, w: '90%', h: 4, fontSize: 18, color: '666666' }
    );

    // Speaker notes
    if (slide.notes) {
      s.addNotes(slide.notes);
    }
  });

  return await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
}
```

**Python (python-pptx)**:
```python
from pptx import Presentation
from pptx.util import Inches, Pt

def create_pptx(slides: list) -> bytes:
    prs = Presentation()

    for slide_data in slides:
        slide = prs.slides.add_slide(prs.slide_layouts[1])  # Title + Content

        # Title
        title = slide.shapes.title
        title.text = slide_data['title']

        # Bullets
        body = slide.shapes.placeholders[1]
        tf = body.text_frame
        for bullet in slide_data['bullets']:
            p = tf.add_paragraph()
            p.text = bullet
            p.level = 0

    # Save to bytes
    from io import BytesIO
    buffer = BytesIO()
    prs.save(buffer)
    return buffer.getvalue()
```

### Step 3: Store and Serve

Save the generated file and create a viewer URL:

```typescript
// Backend endpoint for AI-generated presentations
app.post('/api/generate-presentation', async (req, res) => {
  const { prompt } = req.body;

  // 1. Generate slide content with AI
  const slides = await generateSlideContent(prompt);

  // 2. Create PPTX file
  const pptxBuffer = await createPptx(slides);

  // 3. Save to storage
  const fileId = uuid();
  const filename = `${fileId}.pptx`;

  // Local storage
  await fs.writeFile(`./uploads/${filename}`, pptxBuffer);

  // Or cloud storage (S3)
  // await s3.putObject({ Bucket: 'presentations', Key: filename, Body: pptxBuffer });

  // 4. Save metadata
  await db.files.create({
    id: fileId,
    originalName: `${slides[0]?.title || 'Presentation'}.pptx`,
    filename,
    size: pptxBuffer.length,
    createdAt: new Date()
  });

  // 5. Return viewer URL
  res.json({
    fileId,
    viewerUrl: `/api/onlyoffice/config/${fileId}`,
    downloadUrl: `/files/${filename}`
  });
});
```

### Step 4: Display in Browser

Embed the viewer in your application:

```tsx
// React component for AI-generated presentation
function GeneratedPresentation({ fileId }: { fileId: string }) {
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  useEffect(() => {
    // Get ONLYOFFICE config URL
    setViewerUrl(`/onlyoffice.html?configUrl=/api/onlyoffice/config/${fileId}`);
  }, [fileId]);

  if (!viewerUrl) return <div>Loading...</div>;

  return (
    <iframe
      src={viewerUrl}
      style={{ width: '100%', height: '600px', border: 'none' }}
      allow="fullscreen"
    />
  );
}
```

### Complete Integration Example

Full flow from user request to displayed presentation:

```typescript
// Frontend: User requests a presentation
async function requestPresentation(topic: string) {
  // 1. Call backend to generate
  const response = await fetch('/api/generate-presentation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: topic })
  });

  const { fileId, viewerUrl } = await response.json();

  // 2. Display viewer
  return (
    <div className="presentation-container">
      <iframe src={viewerUrl} />
      <button onClick={() => window.open(`/files/${fileId}.pptx`)}>
        Download
      </button>
    </div>
  );
}
```

### Choosing Between ONLYOFFICE and Collabora

| Consideration | ONLYOFFICE | Collabora |
|---------------|------------|-----------|
| Best for AI-generated PPTX | Excellent OOXML support | Good support |
| API complexity | Simple config object | WOPI protocol required |
| Licensing | AGPL (requires source disclosure) | MPL (more permissive) |
| Memory footprint | ~500MB per instance | ~300MB per instance |

**Recommendation**: For AI-generated presentations, ONLYOFFICE typically provides better rendering fidelity for programmatically created PPTX files.

### File Lifecycle Management

For AI-generated files, implement retention policies:

```typescript
// Cleanup job for temporary AI-generated files
async function cleanupOldPresentations() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours

  const oldFiles = await db.files.find({
    createdAt: { $lt: cutoff },
    source: 'ai-generated'
  });

  for (const file of oldFiles) {
    await fs.unlink(`./uploads/${file.filename}`);
    await db.files.delete(file.id);
  }
}

// Run daily
setInterval(cleanupOldPresentations, 24 * 60 * 60 * 1000);
```

---

## Scaling Considerations

### Document Server Scaling

| Metric | ONLYOFFICE | Collabora |
|--------|------------|-----------|
| Memory per instance | 500MB-2GB | 300MB-1GB |
| Users per instance | ~20-50 | ~20-50 |
| Horizontal scaling | Yes (Enterprise) | Yes |
| Session affinity | Required | Required |

### Storage Scaling

```
Small:    Local filesystem or single S3 bucket
Medium:   S3 with CloudFront CDN
Large:    Multi-region S3 with replication
```

### Caching Strategy

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│   CDN       │────▶│   Origin    │
│   Cache     │     │   (Static)  │     │   (Dynamic) │
└─────────────┘     └─────────────┘     └─────────────┘
     │                    │                    │
     │                    │                    ▼
     │                    │              ┌─────────────┐
     │                    │              │   Redis     │
     │                    │              │   (Session) │
     │                    │              └─────────────┘
     ▼                    ▼
  5 min              1 hour
  (viewer)           (static assets)
```

---

## Security Architecture

### Authentication Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  User    │────▶│   IdP    │────▶│   API    │────▶│  Viewer  │
│          │     │ (OAuth)  │     │  Server  │     │  Server  │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
     │                │                │                │
     │                ▼                ▼                ▼
     │           JWT Token        Validate         Signed URL
     │                            + Authorize      + JWT Token
     │                                │                │
     └────────────────────────────────┴────────────────┘
                     Secure Session
```

### File Access Control

```typescript
// Middleware
async function authorizeFileAccess(req, res, next) {
  const { fileId } = req.params;
  const user = req.user;

  const file = await db.files.findById(fileId);

  // Check ownership
  if (file.ownerId === user.id) return next();

  // Check sharing permissions
  const share = await db.shares.find({ fileId, userId: user.id });
  if (share && share.canView) return next();

  // Check organization access
  if (file.orgId === user.orgId && file.orgVisible) return next();

  return res.status(403).json({ error: 'Access denied' });
}
```

### JWT Token Structure (ONLYOFFICE)

```javascript
const token = jwt.sign({
  document: {
    key: fileKey,
    url: fileUrl,
  },
  editorConfig: {
    user: {
      id: userId,
      name: userName
    },
    mode: 'view'
  }
}, JWT_SECRET, { expiresIn: '1h' });
```

---

## Embedding Components

### React Component Example

```tsx
// PresentationViewer.tsx
interface Props {
  viewerUrl: string;
  title: string;
}

export function PresentationViewer({ viewerUrl, title }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="presentation-viewer">
      <div className="header" onClick={() => setExpanded(!expanded)}>
        <FileIcon />
        <span>{title}</span>
        <ChevronIcon direction={expanded ? 'up' : 'down'} />
      </div>

      {expanded && (
        <div className="viewer-container">
          <iframe
            src={viewerUrl}
            style={{ width: '100%', height: '500px', border: 'none' }}
            allow="fullscreen"
          />
        </div>
      )}

      <div className="actions">
        <button onClick={() => window.open(viewerUrl, '_blank')}>
          Open Fullscreen
        </button>
        <button onClick={() => downloadFile(viewerUrl)}>
          Download
        </button>
      </div>
    </div>
  );
}
```

---

## Production Checklist

### Core Infrastructure
- [ ] Enable JWT authentication for ONLYOFFICE (`JWT_ENABLED=true`)
- [ ] Configure SSL/TLS for all services
- [ ] Set up proper CORS policies
- [ ] Implement file size limits and validation
- [ ] Configure session affinity in load balancer
- [ ] Set up monitoring and alerting
- [ ] Implement backup strategy for uploaded files
- [ ] Configure rate limiting
- [ ] Set up audit logging for file access
- [ ] Review and harden network security groups

### AI-Generated Content
- [ ] Implement file retention/cleanup policies
- [ ] Set up rate limiting for AI generation endpoints
- [ ] Monitor AI API costs and usage
- [ ] Validate AI-generated content before storing
- [ ] Implement queuing for high-volume generation requests
- [ ] Set maximum concurrent generation limits
- [ ] Log generation requests for debugging and analytics
