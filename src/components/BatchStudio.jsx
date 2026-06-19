import { useState, useCallback, useRef } from 'react'
import VideoCard from './VideoCard'
import JSZip from 'jszip'

const BATCH_CONCURRENCY = 8
const AUTO_FILL_OPTIONS = [
  { label: '5 sec in', value: 'abs5', desc: '5 seconds' },
  { label: '10%', value: 0.1, desc: '10% through' },
  { label: '25%', value: 0.25, desc: '25% through' },
  { label: '50%', value: 0.5, desc: '50% through' },
]

async function captureVideoAt(file, frac) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const vid = document.createElement('video')
    vid.src = url
    vid.muted = true
    vid.preload = 'auto'
    vid.addEventListener('loadedmetadata', () => {
      const t = frac === 'abs5'
        ? Math.min(5, vid.duration * 0.9)
        : frac * vid.duration
      vid.currentTime = Math.max(0.001, t)
    })
    vid.addEventListener('seeked', () => {
      const canvas = document.createElement('canvas')
      canvas.width = 320; canvas.height = 180
      canvas.getContext('2d').drawImage(vid, 0, 0, 320, 180)
      const dataUrl = canvas.toDataURL('image/png')
      URL.revokeObjectURL(url)
      vid.src = ''
      resolve(dataUrl)
    })
    vid.addEventListener('error', () => { URL.revokeObjectURL(url); resolve(null) })
  })
}

export default function BatchStudio() {
  const [videos, setVideos] = useState([])
  const [captures, setCaptures] = useState({})
  const [dragging, setDragging] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [autoFillOpen, setAutoFillOpen] = useState(false)
  const [autoFilling, setAutoFilling] = useState(false)
  const [autoFillProgress, setAutoFillProgress] = useState(0)
  const inputRef = useRef(null)

  const loadFiles = useCallback((files) => {
    const filtered = Array.from(files).filter(f => f.type.startsWith('video/'))
    if (!filtered.length) return
    setVideos(filtered.map((file, i) => ({ file, id: `${file.name}_${i}_${Date.now()}` })))
    setCaptures({})
  }, [])

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    loadFiles(e.dataTransfer.files)
  }

  const captureCount = Object.keys(captures).length
  const pendingCount = videos.length - captureCount

  const handleAutoFill = async (option) => {
    setAutoFillOpen(false)
    const pending = videos.filter(v => !captures[v.id])
    if (!pending.length) return
    setAutoFilling(true)
    setAutoFillProgress(0)
    let done = 0

    for (let i = 0; i < pending.length; i += BATCH_CONCURRENCY) {
      const batch = pending.slice(i, i + BATCH_CONCURRENCY)
      await Promise.all(
        batch.map(async ({ file, id }) => {
          const dataUrl = await captureVideoAt(file, option.value)
          if (dataUrl) {
            setCaptures(prev => ({ ...prev, [id]: dataUrl }))
          }
          done++
          setAutoFillProgress(done / pending.length)
        })
      )
    }

    setAutoFilling(false)
    setAutoFillProgress(0)
  }

  const handleDownload = async () => {
    if (!captureCount) return
    setExporting(true)
    try {
      const zip = new JSZip()
      for (const { file, id } of videos) {
        if (!captures[id]) continue
        const base64 = captures[id].split(',')[1]
        const name = file.name.replace(/\.[^/.]+$/, '') + '.png'
        zip.file(name, base64, { base64: true })
      }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'thumbnails.zip'; a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  // Drop zone screen
  if (!videos.length) {
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          flex: 1,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '40px', gap: '36px',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '9px',
            marginBottom: '8px',
          }}>
            <GridIcon size={20} />
            <span style={{ fontSize: '18px', fontWeight: '600', letterSpacing: '-0.3px' }}>
              Batch Thumbnails
            </span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            Pick one thumbnail per video, download them all as a zip
          </p>
        </div>

        <div
          onClick={() => inputRef.current?.click()}
          style={{
            width: '100%', maxWidth: '440px',
            padding: '48px 40px',
            border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: '16px',
            background: dragging ? 'rgba(17,17,17,0.02)' : 'var(--surface)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: '12px', cursor: 'pointer',
            transition: 'all 0.15s ease',
            transform: dragging ? 'scale(1.01)' : 'scale(1)',
          }}
        >
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px',
            background: dragging ? 'var(--accent)' : '#f0f0f0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}>
            <FolderIcon color={dragging ? '#fff' : '#888'} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontWeight: '500', marginBottom: '4px' }}>
              {dragging ? 'Drop your videos!' : 'Drop a folder or multiple videos'}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              or <span style={{ color: 'var(--text-primary)', textDecoration: 'underline' }}>browse</span> to select files
            </p>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
            MP4, MOV, WebM, AVI · any number of files
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => loadFiles(e.target.files)}
        />

        {/* How it works */}
        <div style={{
          display: 'flex', gap: '32px',
          color: 'var(--text-muted)', fontSize: '12px',
        }}>
          {[
            ['01', 'Drop your folder'],
            ['02', 'Hover to scrub · click to pick'],
            ['03', 'Download all as ZIP'],
          ].map(([n, t]) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span style={{
                fontSize: '10px', fontWeight: '700',
                color: 'var(--text-primary)', opacity: 0.35,
              }}>{n}</span>
              <span>{t}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const progress = videos.length > 0 ? captureCount / videos.length : 0

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        flexShrink: 0, gap: '14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => { setVideos([]); setCaptures({}) }}
            style={{
              width: '30px', height: '30px', borderRadius: '7px',
              background: 'transparent', color: 'var(--text-secondary)',
              border: 'none', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            title="Load new folder"
          >
            <ArrowLeftIcon />
          </button>
          <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />
          <div>
            <p style={{ fontWeight: '500', fontSize: '13px' }}>
              Batch Thumbnails
            </p>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {captureCount} of {videos.length} picked
              {pendingCount > 0 ? ` · ${pendingCount} remaining` : ' · all done!'}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{
          flex: 1, maxWidth: '200px',
          height: '4px', borderRadius: '2px',
          background: 'var(--border)', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${autoFilling ? autoFillProgress * 100 : progress * 100}%`,
            background: autoFilling ? '#f59e0b' : (progress === 1 ? '#22c55e' : '#111'),
            borderRadius: '2px',
            transition: 'width 0.2s ease',
          }} />
        </div>

        <div style={{ display: 'flex', gap: '7px', alignItems: 'center', flexShrink: 0 }}>
          {/* Auto-fill */}
          {pendingCount > 0 && !autoFilling && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setAutoFillOpen(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '7px 13px', borderRadius: '7px',
                  background: 'var(--surface-hover)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  fontWeight: '500', fontSize: '12px', cursor: 'pointer',
                  fontFamily: 'inherit', transition: 'all 0.1s',
                }}
              >
                <WandIcon /> Auto-fill {pendingCount}
              </button>
              {autoFillOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  zIndex: 50, overflow: 'hidden', minWidth: '180px',
                }}>
                  <div style={{ padding: '10px 12px 6px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' }}>
                    Set all pending to…
                  </div>
                  {AUTO_FILL_OPTIONS.map(opt => (
                    <button key={opt.label}
                      onClick={() => handleAutoFill(opt)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '8px 14px', background: 'none',
                        border: 'none', cursor: 'pointer',
                        fontSize: '13px', color: 'var(--text-primary)',
                        fontFamily: 'inherit', transition: 'background 0.08s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      {opt.label}
                      <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                        {opt.desc}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Auto-fill progress */}
          {autoFilling && (
            <span style={{ fontSize: '12px', color: '#f59e0b', fontWeight: '500' }}>
              Auto-filling… {Math.round(autoFillProgress * 100)}%
            </span>
          )}

          {/* Download */}
          <button
            onClick={handleDownload}
            disabled={!captureCount || exporting}
            style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              padding: '7px 15px', borderRadius: '7px',
              background: captureCount > 0 ? 'var(--accent)' : 'var(--border)',
              color: captureCount > 0 ? '#fff' : 'var(--text-muted)',
              fontWeight: '500', fontSize: '13px',
              border: 'none', cursor: captureCount > 0 ? 'pointer' : 'default',
              transition: 'all 0.1s', fontFamily: 'inherit',
              opacity: exporting ? 0.7 : 1,
            }}
            onMouseEnter={e => { if (captureCount > 0 && !exporting) e.currentTarget.style.background = 'var(--accent-hover)' }}
            onMouseLeave={e => { if (captureCount > 0) e.currentTarget.style.background = 'var(--accent)' }}
          >
            <DownloadIcon />
            {exporting ? 'Zipping…' : `Download ${captureCount} PNG${captureCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>

      {/* Video grid */}
      <div
        style={{
          flex: 1, overflowY: 'auto',
          padding: '20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '12px',
          alignContent: 'start',
        }}
        onClick={() => setAutoFillOpen(false)}
      >
        {videos.map(({ file, id }) => (
          <VideoCard
            key={id}
            videoFile={file}
            captured={captures[id]}
            onCapture={(url) => setCaptures(prev => ({ ...prev, [id]: url }))}
          />
        ))}
      </div>
    </div>
  )
}

function ArrowLeftIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
}
function GridIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
}
function FolderIcon({ color = '#888' }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
}
function DownloadIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
}
function WandIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h0"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg>
}
