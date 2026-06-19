import { useRef, useState, useEffect, useCallback } from 'react'

const DRAW_W = 320  // canvas buffer base width

function fmtTime(s) {
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(1).padStart(4, '0')
  return `${m}:${sec}`
}

// Draws `source` (video or image) into `canvas` at `rotation` degrees CW.
// Canvas buffer dimensions are set imperatively here; CSS aspect-ratio on the
// wrapper div handles the layout ratio so React never clears the buffer.
function paintFrame(canvas, source, nw, nh, rotation) {
  const drawH = Math.round(DRAW_W * nh / nw)
  const isOrtho = rotation === 90 || rotation === 270
  const bufW = isOrtho ? drawH : DRAW_W
  const bufH = isOrtho ? DRAW_W : drawH

  canvas.width = bufW
  canvas.height = bufH

  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, bufW, bufH)
  ctx.save()
  ctx.translate(bufW / 2, bufH / 2)
  ctx.rotate(rotation * Math.PI / 180)
  ctx.drawImage(source, -DRAW_W / 2, -drawH / 2, DRAW_W, drawH)
  ctx.restore()
}

export default function VideoCard({ videoFile, captured, onCapture, onUncapture, rotation = 0, onRotate }) {
  const canvasRef       = useRef(null)
  const videoRef        = useRef(null)
  const nativeRef       = useRef({ w: 1280, h: 720 })
  const rotationRef     = useRef(rotation)
  const capturedImgRef  = useRef(null)
  const seekingRef      = useRef(false)
  const pendingTimeRef  = useRef(null)

  const [nativeDims, setNativeDims] = useState({ w: 1280, h: 720 })
  const [duration, setDuration]     = useState(0)
  const [hoverFrac, setHoverFrac]   = useState(null)
  const [isHovering, setIsHovering] = useState(false)
  const [currentFrac, setCurrentFrac] = useState(0.1)
  const [flash, setFlash]           = useState(false)
  const [loaded, setLoaded]         = useState(false)

  // Keep rotationRef current every render so event-handler closures get the latest value
  rotationRef.current = rotation

  // Core draw — always reads refs so it's safe to call from anywhere
  const drawFrame = useCallback((source) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { w, h } = nativeRef.current
    paintFrame(canvas, source, w, h, rotationRef.current)
  }, [])

  // Re-draw when rotation changes
  useEffect(() => {
    if (!loaded) return
    if (capturedImgRef.current) {
      drawFrame(capturedImgRef.current)
    } else {
      const vid = videoRef.current
      if (vid) drawFrame(vid)
    }
  }, [rotation, loaded, drawFrame])

  // Load / redraw when `captured` changes
  useEffect(() => {
    if (captured) {
      const img = new Image()
      img.onload = () => { capturedImgRef.current = img; drawFrame(img) }
      img.src = captured
    } else {
      capturedImgRef.current = null
      const vid = videoRef.current
      if (vid && loaded) drawFrame(vid)
    }
  }, [captured, drawFrame, loaded])

  // Video lifecycle
  useEffect(() => {
    const url = URL.createObjectURL(videoFile)
    const vid = document.createElement('video')
    vid.src = url; vid.muted = true; vid.preload = 'metadata'; vid.playsInline = true
    videoRef.current = vid

    vid.addEventListener('loadedmetadata', () => {
      const vw = vid.videoWidth  || 1280
      const vh = vid.videoHeight || 720
      nativeRef.current = { w: vw, h: vh }
      setNativeDims({ w: vw, h: vh })
      setDuration(vid.duration)
      vid.currentTime = Math.min(vid.duration * 0.1, vid.duration - 0.001)
    })

    vid.addEventListener('seeked', () => {
      if (!capturedImgRef.current) {
        drawFrame(vid)
        setLoaded(true)
      }
      seekingRef.current = false
      if (pendingTimeRef.current !== null) {
        const t = pendingTimeRef.current
        pendingTimeRef.current = null
        seekingRef.current = true
        vid.currentTime = t
      }
    })

    return () => { URL.revokeObjectURL(url); vid.src = '' }
  }, [videoFile, drawFrame])

  const seekTo = useCallback((frac) => {
    if (!videoRef.current || duration === 0) return
    setCurrentFrac(frac)
    const t = frac * duration
    if (seekingRef.current) {
      pendingTimeRef.current = t
    } else {
      seekingRef.current = true
      pendingTimeRef.current = null
      videoRef.current.currentTime = t
    }
  }, [duration])

  const handleMouseMove = useCallback((e) => {
    if (captured) return
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1))
    setHoverFrac(frac)
    seekTo(frac)
  }, [captured, seekTo])

  // Capture stores the RAW (unrotated) frame; rotation is applied at display & export time
  const handleClick = useCallback(() => {
    if (captured) { onUncapture(); return }
    const vid = videoRef.current
    if (!vid || !loaded) return
    const { w: vw, h: vh } = nativeRef.current
    const scale = Math.min(1, 1280 / vw)
    const cw = Math.round(vw * scale)
    const ch = Math.round(vh * scale)
    const off = document.createElement('canvas')
    off.width = cw; off.height = ch
    off.getContext('2d').drawImage(vid, 0, 0, cw, ch)
    setFlash(true)
    setTimeout(() => setFlash(false), 220)
    onCapture(off.toDataURL('image/png'))
  }, [captured, loaded, onCapture, onUncapture])

  const displayFrac = hoverFrac !== null ? hoverFrac : currentFrac
  const lockedTime  = captured && duration > 0 ? fmtTime(currentFrac * duration) : null
  const baseName    = videoFile.name.replace(/\.[^/.]+$/, '')
  const isOrtho     = rotation === 90 || rotation === 270

  // aspect-ratio CSS drives the layout box; the canvas just fills it
  const wrapAR = isOrtho
    ? nativeDims.h / nativeDims.w   // portrait box for 90/270
    : nativeDims.w / nativeDims.h   // landscape / native

  return (
    <div style={{
      borderRadius: '10px', overflow: 'hidden',
      border: `1.5px solid ${captured ? '#111' : 'var(--border)'}`,
      background: 'var(--surface)',
      boxShadow: captured
        ? '0 0 0 3px rgba(17,17,17,0.08), 0 2px 8px rgba(0,0,0,0.1)'
        : '0 1px 3px rgba(0,0,0,0.06)',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    }}>

      {/* ── Image area ──────────────────────────────────────────────
          aspect-ratio on the wrapper = correct layout box always.
          Canvas fills it absolutely; React never touches canvas dimensions. */}
      <div
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => { setIsHovering(false); setHoverFrac(null) }}
        onClick={handleClick}
        style={{
          position: 'relative', width: '100%',
          aspectRatio: wrapAR,
          background: '#0e0e0e',
          cursor: !loaded ? 'default' : captured ? 'pointer' : 'crosshair',
          overflow: 'hidden', userSelect: 'none',
        }}
      >
        <canvas ref={canvasRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
        />

        {!loaded && (
          <div style={{ position: 'absolute', inset: 0, background: '#181818', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spinner />
          </div>
        )}

        {flash && <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.6)', pointerEvents: 'none' }} />}

        {captured && isHovering && !flash && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '7px', pointerEvents: 'none' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <UnlockIcon />
            </div>
            <span style={{ color: '#fff', fontSize: 10, fontWeight: 500 }}>Click to unlock</span>
          </div>
        )}

        {captured && !isHovering && !flash && (
          <div style={{ position: 'absolute', top: 7, right: 7, width: 22, height: 22, borderRadius: 6, background: 'rgba(17,17,17,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>
            <LockIcon />
          </div>
        )}

        {!captured && hoverFrac !== null && loaded && (
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${hoverFrac * 100}%`, width: 1.5, background: 'rgba(255,255,255,0.75)', boxShadow: '0 0 5px rgba(0,0,0,0.5)', transform: 'translateX(-50%)', pointerEvents: 'none' }} />
        )}

        {!captured && hoverFrac !== null && loaded && !flash && (
          <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(5px)', color: '#fff', fontSize: 10, fontWeight: 500, padding: '3px 9px', borderRadius: 5, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
            Click to lock frame
          </div>
        )}

        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'rgba(255,255,255,0.08)', pointerEvents: 'none' }}>
          <div style={{ height: '100%', width: `${displayFrac * 100}%`, background: 'rgba(255,255,255,0.5)', transition: !captured && hoverFrac !== null ? 'none' : 'width 0.1s' }} />
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 5, borderTop: captured ? '1.5px solid #111' : '1.5px solid transparent', transition: 'border-color 0.15s' }}>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }} title={videoFile.name}>
          {baseName}
        </span>

        {/* Per-card rotate CW button */}
        <button
          onClick={e => { e.stopPropagation(); onRotate?.((rotation + 90) % 360) }}
          title={`Rotate 90° CW (currently ${rotation}°)`}
          style={{ width: 20, height: 20, borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: rotation !== 0 ? 'var(--text-secondary)' : 'var(--text-muted)', flexShrink: 0, padding: 0, transition: 'color 0.1s' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
          onMouseLeave={e => e.currentTarget.style.color = rotation !== 0 ? 'var(--text-secondary)' : 'var(--text-muted)'}
        ><RotateIcon /></button>

        {rotation !== 0 && (
          <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{rotation}°</span>
        )}

        {captured ? (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
            <LockIcon size={9} /> {lockedTime}
          </span>
        ) : (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
            {loaded ? 'Pending' : '…'}
          </span>
        )}
      </div>
    </div>
  )
}

function LockIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  )
}
function UnlockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
    </svg>
  )
}
function RotateIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2v6h-6"/>
      <path d="M21 13a9 9 0 1 1-3-7.7L21 8"/>
    </svg>
  )
}
function Spinner() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2.5" strokeLinecap="round">
      <style>{`@keyframes vspin{to{transform:rotate(360deg)}} .vs{animation:vspin 0.85s linear infinite;transform-origin:12px 12px}`}</style>
      <circle className="vs" cx="12" cy="12" r="9" strokeDasharray="38 18"/>
    </svg>
  )
}
