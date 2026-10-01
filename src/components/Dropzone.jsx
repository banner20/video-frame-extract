import { useState, useCallback, useRef } from 'react'

// Parse a Google Drive share URL and return the file ID, or null.
function parseGDriveId(raw) {
  let m = raw.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (m) return m[1]
  m = raw.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (m) return m[1]
  return null
}

// Convert any supported link to { url, name } for the video element.
function resolveLink(raw) {
  const s = raw.trim()
  if (!s) return null

  const gdId = parseGDriveId(s)
  if (gdId) {
    return {
      url: `https://drive.google.com/uc?export=download&confirm=t&id=${gdId}`,
      name: `gdrive-${gdId.slice(0, 8)}.mp4`,
    }
  }

  try {
    const u = new URL(s)
    if (!u.protocol.startsWith('http')) return null
    const parts = u.pathname.split('/').filter(Boolean)
    const last = parts[parts.length - 1] || ''
    const name = /\.(mp4|mov|webm|avi|mkv|m4v)$/i.test(last) ? last : 'video.mp4'
    return { url: s, name }
  } catch {
    return null
  }
}

export default function Dropzone({ onVideoLoad }) {
  const [dragging, setDragging]     = useState(false)
  const [linkValue, setLinkValue]   = useState('')
  const [linkError, setLinkError]   = useState('')
  const inputRef = useRef(null)

  const handleFile = useCallback((file) => {
    if (file && file.type.startsWith('video/')) onVideoLoad(file)
  }, [onVideoLoad])

  const onDragOver  = (e) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)
  const onDrop = (e) => {
    e.preventDefault(); setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  const handleLinkLoad = () => {
    setLinkError('')
    const resolved = resolveLink(linkValue)
    if (!resolved) { setLinkError('Paste a Google Drive share link or a direct video URL.'); return }
    onVideoLoad({ ...resolved, isRemote: true })
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px', gap: '32px',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <FilmIcon size={22} />
          <span style={{ fontSize: '18px', fontWeight: '600', letterSpacing: '-0.3px' }}>Frame Extract</span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          Pick frames from any video and export them as images
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
        onClick={() => inputRef.current.click()}
        style={{
          width: '100%', maxWidth: '440px', aspectRatio: '16/9',
          border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: '16px',
          background: dragging ? 'rgba(17,17,17,0.02)' : 'var(--surface)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: '12px', cursor: 'pointer', transition: 'all 0.15s ease',
          transform: dragging ? 'scale(1.01)' : 'scale(1)',
        }}
      >
        <div style={{
          width: '48px', height: '48px', borderRadius: '12px',
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
        <p style={{ color: 'var(--text-muted)', fontSize: '11px' }}>MP4, MOV, WebM, AVI · any size</p>
        <input ref={inputRef} type="file" accept="video/*" style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files[0])} />
      </div>

      {/* URL input */}
      <div style={{ width: '100%', maxWidth: '440px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>or paste a link</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <span style={{
              position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-muted)', pointerEvents: 'none', display: 'flex',
            }}>
              <LinkIcon />
            </span>
            <input
              value={linkValue}
              onChange={e => { setLinkValue(e.target.value); setLinkError('') }}
              onKeyDown={e => e.key === 'Enter' && handleLinkLoad()}
              placeholder="Google Drive share link or direct video URL"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '8px 10px 8px 30px',
                border: `1px solid ${linkError ? '#f87171' : 'var(--border)'}`,
                borderRadius: '8px',
                background: 'var(--surface)', color: 'var(--text-primary)',
                fontSize: '12px', fontFamily: 'inherit', outline: 'none',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => { if (!linkError) e.currentTarget.style.borderColor = 'var(--accent)' }}
              onBlur={e => { if (!linkError) e.currentTarget.style.borderColor = 'var(--border)' }}
            />
          </div>
          <button
            onClick={handleLinkLoad}
            disabled={!linkValue.trim()}
            style={{
              padding: '8px 14px', borderRadius: '8px',
              background: linkValue.trim() ? 'var(--accent)' : 'var(--surface-hover)',
              color: linkValue.trim() ? '#fff' : 'var(--text-muted)',
              border: '1px solid transparent',
              fontWeight: '500', fontSize: '12px', cursor: linkValue.trim() ? 'pointer' : 'default',
              fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all 0.12s',
              flexShrink: 0,
            }}
          >
            Load
          </button>
        </div>

        {linkError ? (
          <p style={{ fontSize: '11px', color: '#ef4444', marginTop: '5px' }}>{linkError}</p>
        ) : (
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px' }}>
            Google Drive · direct MP4/WebM URLs · file must be set to <em>Anyone with the link</em>
          </p>
        )}
      </div>
    </div>
  )
}

function LinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
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
