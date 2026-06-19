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
const RES_OPTIONS = [
  { label: 'Original', value: 'original' },
  { label: '1920px', value: '1920' },
  { label: '1280px', value: '1280' },
  { label: '960px', value: '960' },
  { label: '640px', value: '640' },
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
      const vw = vid.videoWidth || 1280
      const vh = vid.videoHeight || 720
      const scale = Math.min(1, 1280 / vw)
      const cw = Math.round(vw * scale)
      const ch = Math.round(vh * scale)
      const canvas = document.createElement('canvas')
      canvas.width = cw; canvas.height = ch
      canvas.getContext('2d').drawImage(vid, 0, 0, cw, ch)
      const dataUrl = canvas.toDataURL('image/png')
      URL.revokeObjectURL(url); vid.src = ''
      resolve(dataUrl)
    })
    vid.addEventListener('error', () => { URL.revokeObjectURL(url); resolve(null) })
  })
}

async function processDataUrl(dataUrl, format, quality, maxWidth) {
  if (format === 'png' && maxWidth === 'original') return { dataUrl, ext: 'png' }
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      let w = img.width, h = img.height
      if (maxWidth !== 'original') {
        const mw = parseInt(maxWidth)
        if (w > mw) { h = Math.round(h * mw / w); w = mw }
      }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      const mime = format === 'jpg' ? 'image/jpeg' : 'image/png'
      resolve({
        dataUrl: canvas.toDataURL(mime, format === 'jpg' ? quality : 1),
        ext: format === 'jpg' ? 'jpg' : 'png',
      })
    }
    img.src = dataUrl
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
  // Options
  const [filter, setFilter] = useState('all')       // 'all' | 'pending' | 'set'
  const [cardWidth, setCardWidth] = useState(260)   // min card width in px
  const [outputFormat, setOutputFormat] = useState('png')
  const [outputQuality, setOutputQuality] = useState(0.88)
  const [outputRes, setOutputRes] = useState('original')
  const inputRef = useRef(null)

  const loadFiles = useCallback((files) => {
    const filtered = Array.from(files).filter(f => f.type.startsWith('video/'))
    if (!filtered.length) return
    setVideos(filtered.map((file, i) => ({ file, id: `${file.name}_${i}_${Date.now()}` })))
    setCaptures({})
    setFilter('all')
  }, [])

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    loadFiles(e.dataTransfer.files)
  }

  const captureCount = Object.keys(captures).length
  const pendingCount = videos.length - captureCount

  const filteredVideos = videos.filter(({ id }) => {
    if (filter === 'pending') return !captures[id]
    if (filter === 'set') return !!captures[id]
    return true
  })

  const handleAutoFill = async (option) => {
    setAutoFillOpen(false)
    const pending = videos.filter(v => !captures[v.id])
    if (!pending.length) return
    setAutoFilling(true)
    setAutoFillProgress(0)
    let done = 0
    for (let i = 0; i < pending.length; i += BATCH_CONCURRENCY) {
      const batch = pending.slice(i, i + BATCH_CONCURRENCY)
      await Promise.all(batch.map(async ({ file, id }) => {
        const dataUrl = await captureVideoAt(file, option.value)
        if (dataUrl) setCaptures(prev => ({ ...prev, [id]: dataUrl }))
        done++
        setAutoFillProgress(done / pending.length)
      }))
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
        const { dataUrl, ext } = await processDataUrl(captures[id], outputFormat, outputQuality, outputRes)
        const name = file.name.replace(/\.[^/.]+$/, '') + '.' + ext
        zip.file(name, dataUrl.split(',')[1], { base64: true })
      }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `thumbnails_${outputFormat}.zip`; a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  // ── Drop zone ─────────────────────────────────────────────────────────────
  if (!videos.length) {
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '40px', gap: '36px',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', marginBottom: '8px' }}>
            <GridIcon size={20} />
            <span style={{ fontSize: '18px', fontWeight: '600', letterSpacing: '-0.3px' }}>Batch Thumbnails</span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            Pick one thumbnail per video, download them all as a zip
          </p>
        </div>

        <div
          onClick={() => inputRef.current?.click()}
          style={{
            width: '100%', maxWidth: '440px', padding: '48px 40px',
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
          <p style={{ color: 'var(--text-muted)', fontSize: '11px' }}>MP4, MOV, WebM, AVI · any number of files</p>
        </div>

        <input ref={inputRef} type="file" accept="video/*" multiple
          style={{ display: 'none' }} onChange={(e) => loadFiles(e.target.files)} />

        <div style={{ display: 'flex', gap: '32px', color: 'var(--text-muted)', fontSize: '12px' }}>
          {[['01', 'Drop your folder'], ['02', 'Hover to scrub · click to lock'], ['03', 'Download as ZIP']].map(([n, t]) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-primary)', opacity: 0.35 }}>{n}</span>
              <span>{t}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const progress = videos.length > 0 ? captureCount / videos.length : 0
  const extLabel = outputFormat.toUpperCase()

  // ── Grid view ─────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      onClick={() => setAutoFillOpen(false)}>

      {/* ── Main toolbar ── */}
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
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            title="Load new folder"
          ><ArrowLeftIcon /></button>
          <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />
          <div>
            <p style={{ fontWeight: '500', fontSize: '13px' }}>Batch Thumbnails</p>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {captureCount} of {videos.length} locked
              {pendingCount > 0 ? ` · ${pendingCount} pending` : ' · all done!'}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{
          flex: 1, maxWidth: '180px',
          height: '3px', borderRadius: '2px',
          background: 'var(--border)', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${(autoFilling ? autoFillProgress : progress) * 100}%`,
            background: autoFilling ? '#f59e0b' : progress === 1 ? '#22c55e' : '#111',
            borderRadius: '2px', transition: 'width 0.2s ease',
          }} />
        </div>

        <div style={{ display: 'flex', gap: '7px', alignItems: 'center', flexShrink: 0 }}>
          {/* Auto-fill */}
          {pendingCount > 0 && !autoFilling && (
            <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setAutoFillOpen(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '7px 13px', borderRadius: '7px',
                  background: 'var(--surface-hover)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  fontWeight: '500', fontSize: '12px', cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              ><WandIcon /> Auto-fill {pendingCount}</button>
              {autoFillOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  zIndex: 50, overflow: 'hidden', minWidth: '185px',
                }}>
                  <div style={{ padding: '10px 12px 6px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' }}>
                    Lock all pending frames at…
                  </div>
                  {AUTO_FILL_OPTIONS.map(opt => (
                    <button key={opt.label} onClick={() => handleAutoFill(opt)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '8px 14px', background: 'none', border: 'none',
                        cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)',
                        fontFamily: 'inherit',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      {opt.label}
                      <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>{opt.desc}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {autoFilling && (
            <span style={{ fontSize: '12px', color: '#f59e0b', fontWeight: '500' }}>
              Auto-filling… {Math.round(autoFillProgress * 100)}%
            </span>
          )}

          <button
            onClick={handleDownload}
            disabled={!captureCount || exporting}
            style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              padding: '7px 15px', borderRadius: '7px',
              background: captureCount > 0 ? 'var(--accent)' : 'var(--border)',
              color: captureCount > 0 ? '#fff' : 'var(--text-muted)',
              fontWeight: '500', fontSize: '13px', border: 'none',
              cursor: captureCount > 0 ? 'pointer' : 'default',
              fontFamily: 'inherit', opacity: exporting ? 0.7 : 1,
              transition: 'opacity 0.1s',
            }}
            onMouseEnter={e => { if (captureCount > 0 && !exporting) e.currentTarget.style.background = 'var(--accent-hover)' }}
            onMouseLeave={e => { if (captureCount > 0) e.currentTarget.style.background = 'var(--accent)' }}
          >
            <DownloadIcon />
            {exporting ? 'Zipping…' : `Download ${captureCount} ${extLabel}${captureCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>

      {/* ── Options bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap',
        padding: '7px 20px', gap: '20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
        flexShrink: 0,
      }}>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: '3px' }}>
          {[
            { key: 'all', label: `All (${videos.length})` },
            { key: 'pending', label: `Pending (${pendingCount})` },
            { key: 'set', label: `Locked (${captureCount})` },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)}
              style={{
                padding: '4px 10px', borderRadius: '5px', border: 'none',
                background: filter === key ? '#111' : 'transparent',
                color: filter === key ? '#fff' : 'var(--text-muted)',
                fontSize: '11px', fontWeight: filter === key ? '600' : '400',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.1s',
              }}
            >{label}</button>
          ))}
        </div>

        <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />

        {/* Zoom slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Zoom</span>
          <input
            type="range" min={140} max={520} step={10}
            value={cardWidth}
            onChange={e => setCardWidth(parseInt(e.target.value))}
            style={{ width: '80px', accentColor: '#111', cursor: 'pointer' }}
          />
          <span style={{
            fontSize: '11px', color: 'var(--text-secondary)',
            fontVariantNumeric: 'tabular-nums', minWidth: '34px',
          }}>{cardWidth}px</span>
        </div>

        <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />

        {/* Format */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Format</span>
          <div style={{ display: 'flex', gap: '3px' }}>
            {['png', 'jpg'].map(f => (
              <button key={f} onClick={() => setOutputFormat(f)}
                style={{
                  padding: '4px 10px', borderRadius: '5px', border: 'none',
                  background: outputFormat === f ? '#111' : 'var(--surface-hover)',
                  color: outputFormat === f ? '#fff' : 'var(--text-muted)',
                  fontSize: '11px', fontWeight: outputFormat === f ? '600' : '400',
                  cursor: 'pointer', fontFamily: 'inherit',
                  textTransform: 'uppercase', letterSpacing: '0.02em',
                  transition: 'all 0.1s',
                }}
              >{f}</button>
            ))}
          </div>
          {outputFormat === 'jpg' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Quality</span>
              <input type="range" min={50} max={100} step={1}
                value={Math.round(outputQuality * 100)}
                onChange={e => setOutputQuality(parseInt(e.target.value) / 100)}
                style={{ width: '64px', accentColor: '#111', cursor: 'pointer' }}
              />
              <span style={{
                fontSize: '11px', color: 'var(--text-secondary)',
                fontVariantNumeric: 'tabular-nums', minWidth: '28px',
              }}>
                {Math.round(outputQuality * 100)}%
              </span>
            </div>
          )}
        </div>

        <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />

        {/* Resolution */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Max size</span>
          <select value={outputRes} onChange={e => setOutputRes(e.target.value)}
            style={{
              padding: '4px 8px', borderRadius: '5px',
              border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text-primary)',
              fontSize: '11px', fontFamily: 'inherit', cursor: 'pointer',
              outline: 'none',
            }}
          >
            {RES_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
      </div>

      {/* ── Grid ── */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '16px 20px',
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
        gap: '10px',
        alignContent: 'start',
      }}>
        {filteredVideos.length === 0 ? (
          <div style={{
            gridColumn: `1 / -1`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '60px 0', color: 'var(--text-muted)', fontSize: '13px',
          }}>
            No {filter === 'pending' ? 'pending' : 'locked'} videos
          </div>
        ) : filteredVideos.map(({ file, id }) => (
          <VideoCard
            key={id}
            videoFile={file}
            captured={captures[id]}
            onCapture={(url) => setCaptures(prev => ({ ...prev, [id]: url }))}
            onUncapture={() => setCaptures(prev => { const n = { ...prev }; delete n[id]; return n })}
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
