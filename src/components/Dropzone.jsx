import { useState, useCallback, useRef } from 'react'

export default function Dropzone({ onVideoLoad }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  const handleFile = useCallback((file) => {
    if (file && file.type.startsWith('video/')) {
      onVideoLoad(file)
    }
  }, [onVideoLoad])

  const onDragOver = (e) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)
  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px',
      gap: '40px',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '8px',
        }}>
          <FilmIcon size={22} />
          <span style={{ fontSize: '18px', fontWeight: '600', letterSpacing: '-0.3px' }}>
            Frame Extract
          </span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          Pick frames from any video and export them as images
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current.click()}
        style={{
          width: '100%',
          maxWidth: '440px',
          aspectRatio: '16/9',
          border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: '16px',
          background: dragging ? 'rgba(17,17,17,0.02)' : 'var(--surface)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          transform: dragging ? 'scale(1.01)' : 'scale(1)',
        }}
      >
        <div style={{
          width: '48px', height: '48px',
          borderRadius: '12px',
          background: dragging ? 'var(--accent)' : '#f0f0f0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s ease',
        }}>
          <UploadIcon color={dragging ? '#fff' : '#888'} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontWeight: '500', marginBottom: '4px' }}>
            {dragging ? 'Drop it!' : 'Drop a video here'}
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            or <span style={{ color: 'var(--text-primary)', textDecoration: 'underline' }}>browse</span> to choose a file
          </p>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
          MP4, MOV, WebM, AVI · any size
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files[0])}
        />
      </div>
    </div>
  )
}

function FilmIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
      <line x1="7" y1="2" x2="7" y2="22"/>
      <line x1="17" y1="2" x2="17" y2="22"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <line x1="2" y1="7" x2="7" y2="7"/>
      <line x1="2" y1="17" x2="7" y2="17"/>
      <line x1="17" y1="17" x2="22" y2="17"/>
      <line x1="17" y1="7" x2="22" y2="7"/>
    </svg>
  )
}

function UploadIcon({ color = '#888' }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16"/>
      <line x1="12" y1="12" x2="12" y2="21"/>
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
    </svg>
  )
}
