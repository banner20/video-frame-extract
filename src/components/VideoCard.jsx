import { useRef, useState, useEffect, useCallback } from 'react'

const CW = 320
const CH = 180

export default function VideoCard({ videoFile, captured, onCapture }) {
  const canvasRef = useRef(null)
  const videoRef = useRef(null)
  const seekingRef = useRef(false)
  const pendingTimeRef = useRef(null)

  const [duration, setDuration] = useState(0)
  const [hoverFrac, setHoverFrac] = useState(null)
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

    const drawFrame = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.getContext('2d').drawImage(vid, 0, 0, CW, CH)
      setLoaded(true)
    }

    vid.addEventListener('loadedmetadata', () => {
      setDuration(vid.duration)
      vid.currentTime = Math.min(vid.duration * 0.1, vid.duration - 0.001)
    })

    vid.addEventListener('seeked', () => {
      drawFrame()
      seekingRef.current = false
      if (pendingTimeRef.current !== null) {
        const t = pendingTimeRef.current
        pendingTimeRef.current = null
        seekingRef.current = true
        vid.currentTime = t
      }
    })

    return () => {
      URL.revokeObjectURL(url)
      vid.src = ''
    }
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
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1))
    setHoverFrac(frac)
    seekTo(frac)
  }, [seekTo])

  const handleClick = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !loaded) return
    setFlash(true)
    setTimeout(() => setFlash(false), 200)
    onCapture(canvas.toDataURL('image/png'))
  }, [loaded, onCapture])

  const isCaptured = !!captured
  const displayFrac = hoverFrac !== null ? hoverFrac : currentFrac
  const baseName = videoFile.name.replace(/\.[^/.]+$/, '')

  return (
    <div style={{
      borderRadius: '10px',
      overflow: 'hidden',
      border: `1.5px solid ${isCaptured ? '#22c55e' : 'var(--border)'}`,
      background: 'var(--surface)',
      boxShadow: isCaptured
        ? '0 0 0 3px rgba(34,197,94,0.1), 0 1px 3px rgba(0,0,0,0.06)'
        : '0 1px 3px rgba(0,0,0,0.06)',
      transition: 'border-color 0.2s, box-shadow 0.2s',
    }}>
      {/* Image area — hover to scrub, click to pick */}
      <div
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverFrac(null)}
        onClick={handleClick}
        style={{
          position: 'relative',
          aspectRatio: '16/9',
          background: '#111',
          cursor: loaded ? 'crosshair' : 'default',
          overflow: 'hidden',
          userSelect: 'none',
        }}
      >
        <canvas
          ref={canvasRef}
          width={CW}
          height={CH}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />

        {!loaded && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#1c1c1c',
          }}>
            <Spinner />
          </div>
        )}

        {flash && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(255,255,255,0.65)',
            pointerEvents: 'none',
          }} />
        )}

        {/* Scrub position line */}
        {hoverFrac !== null && loaded && (
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${hoverFrac * 100}%`,
            width: '1.5px',
            background: 'rgba(255,255,255,0.75)',
            boxShadow: '0 0 4px rgba(0,0,0,0.5)',
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
          }} />
        )}

        {/* Click hint on hover */}
        {hoverFrac !== null && loaded && !flash && (
          <div style={{
            position: 'absolute', bottom: '10px', left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.72)',
            backdropFilter: 'blur(5px)',
            color: '#fff', fontSize: '10px', fontWeight: '500',
            padding: '3px 9px', borderRadius: '5px',
            pointerEvents: 'none', whiteSpace: 'nowrap',
            letterSpacing: '0.01em',
          }}>
            {isCaptured ? 'Click to re-pick' : 'Click to pick'}
          </div>
        )}

        {/* Checkmark */}
        {isCaptured && !flash && (
          <div style={{
            position: 'absolute', top: '7px', right: '7px',
            width: '20px', height: '20px', borderRadius: '50%',
            background: '#22c55e',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
        )}

        {/* Scrub progress bar */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: '2px', background: 'rgba(255,255,255,0.1)',
          pointerEvents: 'none',
        }}>
          <div style={{
            height: '100%',
            width: `${displayFrac * 100}%`,
            background: isCaptured ? '#22c55e' : 'rgba(255,255,255,0.55)',
            transition: hoverFrac !== null ? 'none' : 'width 0.1s',
          }} />
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '7px 10px',
        display: 'flex', alignItems: 'center', gap: '6px',
      }}>
        <span style={{
          fontSize: '11px', color: 'var(--text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          flex: 1, minWidth: 0,
        }} title={videoFile.name}>
          {baseName}
        </span>
        <span style={{
          fontSize: '10px', flexShrink: 0,
          color: isCaptured ? '#22c55e' : 'var(--text-muted)',
          fontWeight: isCaptured ? '600' : '400',
        }}>
          {isCaptured ? 'Set ✓' : loaded ? 'Pending' : '…'}
        </span>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" strokeLinecap="round">
      <style>{`@keyframes vspin{to{transform:rotate(360deg)}} .vs{animation:vspin 0.85s linear infinite;transform-origin:12px 12px}`}</style>
      <circle className="vs" cx="12" cy="12" r="9" strokeDasharray="38 18"/>
    </svg>
  )
}
