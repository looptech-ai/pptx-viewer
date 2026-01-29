import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// CORS - allow frontend
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:5555'],
  credentials: true
}));

app.use(express.json());

// Serve uploaded files statically
app.use('/files', express.static(uploadsDir));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueId}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pptx', '.ppt', '.odp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PowerPoint files are allowed'));
    }
  },
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Store file metadata
const fileStore = new Map();

// Upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const fileId = path.basename(req.file.filename, path.extname(req.file.filename));
  const fileInfo = {
    id: fileId,
    originalName: req.file.originalname,
    filename: req.file.filename,
    size: req.file.size,
    uploadedAt: new Date().toISOString()
  };

  fileStore.set(fileId, fileInfo);

  res.json({
    success: true,
    file: fileInfo,
    // URLs for different viewers
    urls: {
      direct: `http://localhost:${PORT}/files/${req.file.filename}`,
      onlyoffice: `http://localhost:${PORT}/api/onlyoffice/editor?fileId=${fileId}`,
      collabora: `http://localhost:${PORT}/api/collabora/editor?fileId=${fileId}`
    }
  });
});

// Get file info
app.get('/api/files/:fileId', (req, res) => {
  const fileInfo = fileStore.get(req.params.fileId);
  if (!fileInfo) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.json(fileInfo);
});

// List all files
app.get('/api/files', (req, res) => {
  res.json(Array.from(fileStore.values()));
});

// ============================================
// ONLYOFFICE Integration
// ============================================

// ONLYOFFICE expects a callback URL for document changes
app.post('/api/onlyoffice/callback', (req, res) => {
  console.log('ONLYOFFICE callback:', req.body);
  // Status 2 = document is ready for saving
  // For view-only mode, we just acknowledge
  res.json({ error: 0 });
});

// Generate ONLYOFFICE editor config
app.get('/api/onlyoffice/config/:fileId', (req, res) => {
  const fileInfo = fileStore.get(req.params.fileId);
  if (!fileInfo) {
    return res.status(404).json({ error: 'File not found' });
  }

  const config = {
    document: {
      fileType: path.extname(fileInfo.filename).slice(1),
      key: fileInfo.id + '_' + Date.now(), // Unique key for caching
      title: fileInfo.originalName,
      url: `http://host.docker.internal:${PORT}/files/${fileInfo.filename}`
    },
    editorConfig: {
      mode: 'view', // 'view' or 'edit'
      callbackUrl: `http://host.docker.internal:${PORT}/api/onlyoffice/callback`,
      user: {
        id: 'user-1',
        name: 'Demo User'
      },
      customization: {
        autosave: false,
        forcesave: false,
        chat: false,
        comments: false,
        compactHeader: true,
        feedback: false,
        help: false,
        toolbarNoTabs: true
      }
    },
    type: 'desktop',
    height: '100%',
    width: '100%'
  };

  res.json(config);
});

// ============================================
// Collabora Online Integration (WOPI)
// ============================================

// WOPI CheckFileInfo endpoint
app.get('/api/wopi/files/:fileId', (req, res) => {
  const fileInfo = fileStore.get(req.params.fileId);
  if (!fileInfo) {
    return res.status(404).json({ error: 'File not found' });
  }

  const filePath = path.join(uploadsDir, fileInfo.filename);
  const stats = fs.statSync(filePath);

  // WOPI CheckFileInfo response
  res.json({
    BaseFileName: fileInfo.originalName,
    OwnerId: 'user-1',
    Size: stats.size,
    UserId: 'user-1',
    UserFriendlyName: 'Demo User',
    Version: fileInfo.id,
    UserCanWrite: false, // View only for now
    ReadOnly: true,
    LastModifiedTime: stats.mtime.toISOString()
  });
});

// WOPI GetFile endpoint
app.get('/api/wopi/files/:fileId/contents', (req, res) => {
  const fileInfo = fileStore.get(req.params.fileId);
  if (!fileInfo) {
    return res.status(404).json({ error: 'File not found' });
  }

  const filePath = path.join(uploadsDir, fileInfo.filename);
  res.sendFile(filePath);
});

// WOPI PutFile endpoint (for saving - not used in view mode)
app.post('/api/wopi/files/:fileId/contents', (req, res) => {
  res.status(501).json({ error: 'Saving not implemented in view mode' });
});

// Get Collabora discovery info
app.get('/api/collabora/discovery', async (req, res) => {
  try {
    const response = await fetch('http://localhost:9980/hosting/discovery');
    const xml = await response.text();
    res.type('application/xml').send(xml);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch Collabora discovery' });
  }
});

// Generate Collabora editor URL
app.get('/api/collabora/editor-url/:fileId', (req, res) => {
  const fileInfo = fileStore.get(req.params.fileId);
  if (!fileInfo) {
    return res.status(404).json({ error: 'File not found' });
  }

  // WOPI source URL (our backend serves as WOPI host)
  const wopiSrc = encodeURIComponent(`http://host.docker.internal:${PORT}/api/wopi/files/${req.params.fileId}`);

  // Collabora editor URL
  const editorUrl = `http://localhost:9980/browser/dist/cool.html?WOPISrc=${wopiSrc}`;

  res.json({
    editorUrl,
    wopiSrc: `http://host.docker.internal:${PORT}/api/wopi/files/${req.params.fileId}`
  });
});

app.listen(PORT, () => {
  console.log(`Backend server running at http://localhost:${PORT}`);
  console.log(`
Endpoints:
  POST /api/upload              - Upload a PPTX file
  GET  /api/files               - List all files
  GET  /api/files/:id           - Get file info
  GET  /api/onlyoffice/config/:id - Get ONLYOFFICE config
  GET  /api/collabora/editor-url/:id - Get Collabora editor URL
  `);
});
