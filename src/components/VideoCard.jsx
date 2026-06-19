import { useRef, useState, useEffect, useCallback } from 'react'

function fmtTime(s) {
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(1).padStart(4, '0')
  return `${m}:${sec}`
}

export default function VideoCard({ videoFile, captured, onCapture, onUncapture }) {
  const canvasRef = useRef(null)
  const videoRef = useRef(null)
  const seekingRef = useRef(false)
  const pendingTimeRef = useRef(null)

  const [duration, setDuration] = useState(0)
  const [aspect, setAspect] = useState('16 / 9')
  const [canvasSize, setCanvasSize] = useState({ w: 320, h: 180 })
  const [hoverFrac, setHoverFrac] = useState(null)
  const [isHovering, setIsHovering] = useState(false)
  const [currentFrac, setCurrentFrac] = useState(0.1)
  const [flash, setFlash] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const url = URL.createObjectURL(videoFile)
    const vid = document.createElement('video')
    vid.src = url
    vid.muted = true
    vid.preload = 'metadata'
    vid.playsInline = true
    videoRef.current = vid

    vid.addEventListener('loadedmetadata', () => {
      const vw = vid.videoWidth || 1280
      const vh = vid.videoHeight || 720
      setAspect(`${vw} / ${vh}`)
      const dw = 320
      const dh = Math.round(dw * vh / vw)
      setCanvasSize({ w: dw, h: dh })
      setDuration(vid.duration)
      vid.currentTime = Math.min(vid.duration * 0.1, vid.duration - 0.001)
    })

    vid.addEventListener('seeked', () => {
      const canvas = canvasRef.current
      if (canvas) {
        canvas.getContext('2d').drawImage(vid, 0, 0, canvas.width, canvas.height)
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
  }, [videoFile])

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
    if (captured) return // locked — no scrubbing
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1))
    setHoverFrac(frac)
    seekTo(frac)
  }, [captured, seekTo])

  const handleClick = useCallback(() => {
    if (captured) {
      onUncapture()
      return
    }
    const vid = videoRef.current
    if (!vid || !loaded) return
    // Capture at up to 1280px wide, preserving actual aspect ratio
    const scale = Math.min(1, 1280 / (vid.videoWidth || 1280))
    const cw = Math.round((vid.videoWidth || 1280) * scale)
    const ch = Math.round((vid.videoHeight || 720) * scale)
    const off = document.createElement('canvas')
    off.width = cw; off.height = ch
    off.getContext('2d').drawImage(vid, 0, 0, cw, ch)
    setFlash(true)
    setTimeout(() => setFlash(false), 220)
    onCapture(off.toDataURL('image/png'))
  }, [captured, loaded, onCapture, onUncapture])

  const displayFrac = hoverFrac !== null ? hoverFrac : currentFrac
  const lockedTime = captured && duration > 0 ? fmtTime(currentFrac * duration) : null
  const baseName = videoFile.name.replace(/\.[^/.]+$/, '')

  return (
    <div style={{
      borderRadius: '10px',
      overflow: 'hidden',
      border: `1.5px solid ${captured ? '#111' : 'var(--border)'}`,
      background: 'var(--surface)',
      boxShadow: captured
        ? '0 0 0 3px rgba(17,17,17,0.08), 0 2px 8px rgba(0,0,0,0.1)'
        : '0 1px 3px rgba(0,0,0,0.06)',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    }}>
      {/* Image area */}
      <div
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => { setIsHovering(false); setHoverFrac(null) }}
        onClick={handleClick}
        style={{
          position: 'relative',
          aspectRatio: aspect,
          background: '#0e0e0e',
          cursor: !loaded ? 'default' : captured ? 'pointer' : 'crosshair',
          overflow: 'hidden',
          userSelect: 'none',
        }}
      >
        <canvas
          ref={canvasRef}
          width={canvasSize.w}
          height={canvasSize.h}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />

        {/* Loading */}
        {!loaded && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#181818',
          }}>
            <Spinner />
          </div>
        )}

        {/* Flash */}
        {flash && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(255,255,255,0.6)',
            pointerEvents: 'none',
          }} />
        )}

        {/* LOCKED overlay on hover */}
        {captured && isHovering && !flash && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: '7px',
            pointerEvents: 'none',
          }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '50%',
              background: 'rgba(255,255,255,0.12)',
              border: '1.5px solid rgba(255,255,255,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff',
            }}>
              <UnlockIcon />
            </div>
            <span style={{
              color: '#fff', fontSize: '10px', fontWeight: '500',
              letterSpacing: '0.02em',
            }}>Click to unlock</span>
          </div>
        )}

        {/* Lock badge (idle, not hovering) */}
        {captured && !isHovering && !flash && (
          <div style={{
            position: 'absolute', top: '7px', right: '7px',
            width: '22px', height: '22px', borderRadius: '6px',
            background: 'rgba(17,17,17,0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
          }}>
            <LockIcon />
          </div>
        )}

        {/* Scrub line (unlocked hover) */}
        {!captured && hoverFrac !== null && loaded && (
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${hoverFrac * 100}%`,
            width: '1.5px',
            background: 'rgba(255,255,255,0.75)',
            boxShadow: '0 0 5px rgba(0,0,0,0.5)',
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
          }} />
        )}

        {/* Pick hint (unlocked hover) */}
        {!captured && hoverFrac !== null && loaded && !flash && (
          <div style={{
            position: 'absolute', bottom: '10px', left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.72)',
            backdropFilter: 'blur(5px)',
            color: '#fff', fontSize: '10px', fontWeight: '500',
            padding: '3px 9px', borderRadius: '5px',
            pointerEvents: 'none', whiteSpace: 'nowrap',
          }}>
            Click to lock frame
          </div>
        )}

        {/* Scrub progress bar */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: '2px', background: 'rgba(255,255,255,0.08)',
          pointerEvents: 'none',
        }}>
          <div style={{
            height: '100%',
            width: `${displayFrac * 100}%`,
            background: captured ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.5)',
            transition: !captured && hoverFrac !== null ? 'none' : 'width 0.1s',
          }} />
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '7px 10px',
        display: 'flex', alignItems: 'center', gap: '6px',
        borderTop: captured ? '1.5px solid #111' : '1.5px solid transparent',
        transition: 'border-color 0.15s',
      }}>
        <span style={{
          fontSize: '11px', color: 'var(--text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          flex: 1, minWidth: 0,
        }} title={videoFile.name}>
          {baseName}
        </span>
        {captured ? (
          <span style={{
            fontSize: '10px', color: 'var(--text-muted)',
            fontVariantNumeric: 'tabular-nums', flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: '4px',
          }}>
            <LockIcon size={9} /> {lockedTime}
          </span>
        ) : (
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>
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
function Spinner() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="rgba(255,255,255,0.2)" strokeWidth="2.5" strokeLinecap="round">
      <style>{`@keyframes vspin{to{transform:rotate(360deg)}} .vs{animation:vspin 0.85s linear infinite;transform-origin:12px 12px}`}</style>
      <circle className="vs" cx="12" cy="12" r="9" strokeDasharray="38 18"/>
    </svg>
  )
}
