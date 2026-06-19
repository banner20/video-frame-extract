import { useState, useCallback } from 'react'
import JSZip from 'jszip'

const FORMATS = ['PNG', 'JPEG', 'WebP']

export default function ExportPanel({ frames, videoName, onClose }) {
  const [format, setFormat] = useState('PNG')
  const [quality, setQuality] = useState(92)
  const [prefix, setPrefix] = useState(() =>
    videoName.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]/gi, '_').slice(0, 30)
  )
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)

  const getMime = (fmt) => ({ PNG: 'image/png', JPEG: 'image/jpeg', WebP: 'image/webp' }[fmt])
  const getExt = (fmt) => fmt.toLowerCase().replace('jpeg', 'jpg')

  const fmtTime = (s) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    const ms = Math.floor((s % 1) * 100)
    return `${m}m${String(sec).padStart(2, '0')}s${String(ms).padStart(2, '0')}`
  }

  const exportZip = useCallback(async () => {
    setExporting(true)
    setProgress(0)

    const zip = new JSZip()
    const mime = getMime(format)
    const ext = getExt(format)
    const q = format === 'PNG' ? undefined : quality / 100

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i]
      const canvas = document.createElement('canvas')
      const img = new Image()
      await new Promise(res => { img.onload = res; img.src = frame.dataUrl })
      canvas.width = img.width
      canvas.height = img.height
      canvas.getContext('2d').drawImage(img, 0, 0)

      const blob = await new Promise(res => canvas.toBlob(res, mime, q))
      const fname = `${prefix}_${String(i + 1).padStart(3, '0')}_${fmtTime(frame.time)}.${ext}`
      zip.file(fname, blob)
      setProgress(i + 1)
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(zipBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${prefix}_frames.zip`
    a.click()
    URL.revokeObjectURL(url)

    setExporting(false)
    setDone(true)
  }, [frames, format, quality, prefix])

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.3)',
        backdropFilter: 'blur(5px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, padding: '20px',
      }}
    >
      <div style={{
        background: 'var(--surface)',
        borderRadius: '16px',
        width: '100%', maxWidth: '400px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 22px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <p style={{ fontWeight: '600', fontSize: '15px' }}>Export as ZIP</p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {frames.length} frame{frames.length !== 1 ? 's' : ''} bundled into one file
            </p>
          </div>
          <button onClick={onClose}
            style={{ width: '28px', height: '28px', borderRadius: '7px', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', transition: 'background 0.1s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Prefix */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>
              File prefix
            </label>
            <input
              type="text"
              value={prefix}
              onChange={e => setPrefix(e.target.value.replace(/[^a-z0-9_-]/gi, '_').slice(0, 40))}
              style={{
                width: '100%', padding: '8px 11px',
                border: '1.5px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '13px', color: 'var(--text-primary)',
                background: 'var(--bg)', outline: 'none', fontFamily: 'inherit',
              }}
              onFocus={e => e.target.style.borderColor = '#999'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              ZIP: <code style={{ fontFamily: 'monospace', fontSize: '11px' }}>{prefix}_frames.zip</code>
            </p>
          </div>

          {/* Format */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>
              Image format
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {FORMATS.map(f => (
                <button key={f} onClick={() => setFormat(f)}
                  style={{
                    flex: 1, padding: '8px', borderRadius: '7px',
                    border: `1.5px solid ${format === f ? '#111' : 'var(--border)'}`,
                    background: format === f ? '#111' : 'var(--bg)',
                    color: format === f ? '#fff' : 'var(--text-secondary)',
                    fontSize: '12px', fontWeight: '500',
                    cursor: 'pointer', transition: 'all 0.1s', fontFamily: 'inherit',
                  }}
                >{f}</button>
              ))}
            </div>
          </div>

          {/* Quality */}
          {format !== 'PNG' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)' }}>Quality</label>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{quality}%</span>
              </div>
              <input type="range" min={10} max={100} value={quality}
                onChange={e => setQuality(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#111' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Smaller file</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Best quality</span>
              </div>
            </div>
          )}

          {/* Frame strip preview */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Frames
            </label>
            <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '4px' }}>
              {frames.map((f, i) => (
                <div key={f.id} style={{
                  position: 'relative', flexShrink: 0,
                  width: '54px', height: '30px',
                  borderRadius: '4px', overflow: 'hidden',
                  border: '1px solid var(--border)',
                }}>
                  <img src={f.dataUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  {exporting && progress > i && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: 'rgba(17,17,17,0.55)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Progress bar */}
          {exporting && (
            <div>
              <div style={{
                height: '4px', background: 'var(--surface-hover)',
                borderRadius: '2px', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${(progress / frames.length) * 100}%`,
                  background: '#111',
                  borderRadius: '2px',
                  transition: 'width 0.2s ease',
                }} />
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'center' }}>
                Encoding {progress}/{frames.length}…
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 22px',
          borderTop: '1px solid var(--border)',
          display: 'flex', gap: '8px',
        }}>
          <button onClick={onClose}
            style={{
              flex: 1, padding: '10px', borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--surface-hover)', color: 'var(--text-primary)',
              fontWeight: '500', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            onClick={done ? onClose : exportZip}
            disabled={exporting}
            style={{
              flex: 2, padding: '10px', borderRadius: '8px',
              border: 'none',
              background: done ? '#16a34a' : '#111',
              color: '#fff',
              fontWeight: '500', fontSize: '13px',
              cursor: exporting ? 'default' : 'pointer',
              opacity: exporting ? 0.75 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
              transition: 'background 0.2s', fontFamily: 'inherit',
            }}
          >
            {done ? (
              <><CheckIconW /> Saved! Close</>
            ) : exporting ? (
              <>Building ZIP…</>
            ) : (
              <><ZipIcon /> Download .zip</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function CloseIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
}
function CheckIconW() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
}
function ZipIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
}
