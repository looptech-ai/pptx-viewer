import { useState, useRef, useCallback } from 'react'

const API_URL = 'http://localhost:3001'

interface FileInfo {
  id: string
  originalName: string
  filename: string
  size: number
  uploadedAt: string
}

interface UploadResponse {
  success: boolean
  file: FileInfo
  urls: {
    direct: string
    onlyoffice: string
    collabora: string
  }
}

type ViewerType = 'onlyoffice' | 'collabora' | 'none'

function App() {
  const [file, setFile] = useState<FileInfo | null>(null)
  const [activeViewer, setActiveViewer] = useState<ViewerType>('none')
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [onlyofficeConfig, setOnlyofficeConfig] = useState<any>(null)
  const [collaboraUrl, setCollaboaUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (uploadedFile: File) => {
    setIsUploading(true)
    setError(null)
    setActiveViewer('none')
    setOnlyofficeConfig(null)
    setCollaboaUrl(null)

    const formData = new FormData()
    formData.append('file', uploadedFile)

    try {
      const response = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error('Upload failed')
      }

      const data: UploadResponse = await response.json()
      setFile(data.file)

      // Fetch ONLYOFFICE config
      const ooConfigRes = await fetch(`${API_URL}/api/onlyoffice/config/${data.file.id}`)
      const ooConfig = await ooConfigRes.json()
      setOnlyofficeConfig(ooConfig)

      // Fetch Collabora URL
      const collabRes = await fetch(`${API_URL}/api/collabora/editor-url/${data.file.id}`)
      const collabData = await collabRes.json()
      setCollaboaUrl(collabData.editorUrl)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      handleUpload(selectedFile)
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      handleUpload(droppedFile)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="container">
      <h1>PPTX Viewer Prototype</h1>

      {/* Upload Section */}
      <div className="upload-section">
        <h2>Upload PowerPoint</h2>
        <div
          className={`upload-zone ${isDragging ? 'dragging' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pptx,.ppt,.odp"
            onChange={handleFileSelect}
          />
          {isUploading ? (
            <div className="loading">
              <div className="spinner"></div>
              <p>Uploading...</p>
            </div>
          ) : (
            <>
              <p>Drop a PowerPoint file here or click to browse</p>
              <span className="hint">Supports .pptx, .ppt, .odp files</span>
            </>
          )}
        </div>

        {error && <div className="error">{error}</div>}

        {file && (
          <div className="file-info">
            <h3>{file.originalName}</h3>
            <p>Size: {formatSize(file.size)} | Uploaded: {new Date(file.uploadedAt).toLocaleString()}</p>
          </div>
        )}
      </div>

      {/* Viewer Section */}
      <div className="viewer-section">
        <div className="tabs">
          <button
            className={`tab ${activeViewer === 'onlyoffice' ? 'active' : ''}`}
            onClick={() => setActiveViewer('onlyoffice')}
            disabled={!file}
          >
            ONLYOFFICE
          </button>
          <button
            className={`tab ${activeViewer === 'collabora' ? 'active' : ''}`}
            onClick={() => setActiveViewer('collabora')}
            disabled={!file}
          >
            Collabora Online
          </button>
        </div>

        <div className="viewer-container">
          {!file ? (
            <div className="viewer-placeholder">
              Upload a PowerPoint file to view it
            </div>
          ) : activeViewer === 'none' ? (
            <div className="viewer-placeholder">
              Select a viewer tab above
            </div>
          ) : activeViewer === 'onlyoffice' ? (
            <OnlyOfficeViewer config={onlyofficeConfig} fileId={file.id} />
          ) : activeViewer === 'collabora' ? (
            <CollaboraViewer url={collaboraUrl} />
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ONLYOFFICE Viewer Component
function OnlyOfficeViewer({ config, fileId }: { config: any; fileId: string }) {
  if (!config) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading ONLYOFFICE config...</p>
      </div>
    )
  }

  // Use our onlyoffice.html page which loads the DocsAPI properly
  const configUrl = encodeURIComponent(`${API_URL}/api/onlyoffice/config/${fileId}`)
  const editorUrl = `/onlyoffice.html?configUrl=${configUrl}`

  return (
    <iframe
      src={editorUrl}
      style={{ width: '100%', height: '100%', border: 'none' }}
      allow="fullscreen"
    />
  )
}

// Collabora Online Viewer Component
function CollaboraViewer({ url }: { url: string | null }) {
  if (!url) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading Collabora URL...</p>
      </div>
    )
  }

  return (
    <iframe
      src={url}
      style={{ width: '100%', height: '100%', border: 'none' }}
      allow="fullscreen"
    />
  )
}

export default App
