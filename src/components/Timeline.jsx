import { useRef, useState, useEffect, useCallback } from 'react'

const THUMBNAIL_COUNT = 24

export default function Timeline({
  videoRef, videoSrc, duration, currentTime,
  selectedFrames, onSeek, playbackRate, onPlaybackRateChange,
}) {
  const timelineRef = useRef(null)
  const hiddenVideoRef = useRef(null)
  const hoverVideoRef = useRef(null)

  const [thumbnails, setThumbnails] = useState([])
  const [thumbsReady, setThumbsReady] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [hoverTime, setHoverTime] = useState(0)
  const [hoverX, setHoverX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [hoverPreviewReady, setHoverPreviewReady] = useState(false)
  const hoverSeekPending = useRef(false)
  const lastHoverTime = useRef(-1)

  // Generate filmstrip from hidden video (doesn't affect main video)
  useEffect(() => {
    if (!videoSrc || duration === 0) return
    const vid = document.createElement('video')
    vid.src = videoSrc
    vid.muted = true
    vid.preload = 'auto'
    hiddenVideoRef.current = vid

    const canvas = document.createElement('canvas')
    canvas.width = 80
    canvas.height = 45
    const ctx = canvas.getContext('2d')
    const thumbs = []
    let i = 0
    let active = true

    const captureNext = () => {
      if (!active || i >= THUMBNAIL_COUNT) {
        if (active) setThumbnails(thumbs)
        setThumbsReady(true)
        return
      }
      const t = (i / (THUMBNAIL_COUNT - 1)) * duration
      vid.currentTime = t
    }

    const onSeeked = () => {
      ctx.drawImage(vid, 0, 0, 80, 45)
      thumbs.push({ time: vid.currentTime, url: canvas.toDataURL('image/jpeg', 0.65) })
      i++
      // batch in rAF to avoid locking UI
      requestAnimationFrame(captureNext)
    }

    const onMeta = () => captureNext()
    vid.addEventListener('loadedmetadata', onMeta)
    vid.addEventListener('seeked', onSeeked)

    return () => {
      active = false
      vid.removeEventListener('loadedmetadata', onMeta)
      vid.removeEventListener('seeked', onSeeked)
      vid.src = ''
    }
  }, [videoSrc, duration])

  // Hover preview: dedicated hidden video seeked live
  useEffect(() => {
    if (!videoSrc) return
    const vid = document.createElement('video')
    vid.src = videoSrc
    vid.muted = true
    vid.preload = 'metadata'
    hoverVideoRef.current = vid

    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 90
    const ctx = canvas.getContext('2d')

    const onSeeked = () => {
      ctx.drawImage(vid, 0, 0, 160, 90)
      // put pixel data into the preview img
      const previewEl = document.getElementById('hover-preview-canvas')
      if (previewEl) {
        const pCtx = previewEl.getContext('2d')
        previewEl.width = 160
        previewEl.height = 90
        pCtx.drawImage(canvas, 0, 0)
      }
      setHoverPreviewReady(true)
      hoverSeekPending.current = false
    }

    vid.addEventListener('seeked', onSeeked)
    return () => { vid.removeEventListener('seeked', onSeeked); vid.src = '' }
  }, [videoSrc])

  // Throttled hover seek
  useEffect(() => {
    if (!hovering || !hoverVideoRef.current) return
    if (Math.abs(hoverTime - lastHoverTime.current) < 0.04) return
    if (hoverSeekPending.current) return
    hoverSeekPending.current = true
    lastHoverTime.current = hoverTime
    setHoverPreviewReady(false)
    hoverVideoRef.current.currentTime = hoverTime
  }, [hoverTime, hovering])

  const getTimeFromEvent = useCallback((e) => {
    const rect = timelineRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    return (x / rect.width) * duration
  }, [duration])

  const handleMouseMove = useCallback((e) => {
    if (!timelineRef.current) return
    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    setHoverX(Math.max(0, Math.min(x, rect.width)))
    setHoverTime(getTimeFromEvent(e))
    if (dragging) onSeek(getTimeFromEvent(e))
  }, [dragging, getTimeFromEvent, onSeek])

  const handleMouseDown = (e) => {
    setDragging(true)
    onSeek(getTimeFromEvent(e))
  }
  const handleMouseUp = () => setDragging(false)

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mouseup', handleMouseUp)
      return () => window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging])

  const formatTime = (s) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    const ms = Math.floor((s % 1) * 10)
    return `${m}:${String(sec).padStart(2, '0')}.${ms}`
  }

  const progress = duration > 0 ? currentTime / duration : 0
  const SPEEDS = [0.25, 0.5, 1, 1.5, 2]

  return (
    <div style={{
      background: 'var(--surface)',
      borderTop: '1px solid var(--border)',
      padding: '12px 20px 16px',
      userSelect: 'none',
    }}>
      {/* Time row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '7px',
        fontSize: '11px',
        color: 'var(--text-muted)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{formatTime(currentTime)}</span>
        <span style={{ opacity: hovering ? 1 : 0, transition: 'opacity 0.1s' }}>{formatTime(hoverTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Filmstrip scrubber */}
      <div
        ref={timelineRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => { setHovering(true); setHoverPreviewReady(false) }}
        onMouseLeave={() => setHovering(false)}
        onMouseDown={handleMouseDown}
        style={{
          position: 'relative',
          height: '52px',
          borderRadius: '8px',
          overflow: 'visible',
          cursor: dragging ? 'grabbing' : 'crosshair',
        }}
      >
        {/* Film strip */}
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: '8px',
          overflow: 'hidden',
          display: 'flex',
          background: '#ddd',
        }}>
          {thumbnails.length > 0 ? thumbnails.map((t, i) => (
            <img key={i} src={t.url}
              style={{ flex: 1, height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
              alt=""
            />
          )) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Spinner />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Building preview…</span>
            </div>
          )}

          {/* Played tint */}
          <div style={{
            position: 'absolute', inset: 0,
            right: `${(1 - progress) * 100}%`,
            background: 'rgba(17,17,17,0.3)',
            borderRadius: '8px 0 0 8px',
            pointerEvents: 'none',
          }} />
        </div>

        {/* Selected frame markers */}
        {selectedFrames.map(frame => {
          const pct = duration > 0 ? (frame.time / duration) * 100 : 0
          return (
            <div key={frame.id} style={{
              position: 'absolute',
              left: `${pct}%`,
              top: '-5px', bottom: '-5px',
              width: '2px',
              background: '#111',
              transform: 'translateX(-50%)',
              pointerEvents: 'none',
              zIndex: 3,
            }}>
              <div style={{
                position: 'absolute',
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%) rotate(45deg)',
                width: '7px', height: '7px',
                background: '#111',
                borderRadius: '1px',
                border: '1.5px solid #fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }} />
            </div>
          )
        })}

        {/* Playhead */}
        <div style={{
          position: 'absolute',
          left: `${progress * 100}%`,
          top: '-6px', bottom: '-6px',
          width: '2px',
          background: '#111',
          transform: 'translateX(-50%)',
          zIndex: 5,
          pointerEvents: 'none',
        }}>
          <div style={{
            position: 'absolute',
            top: '-1px', left: '50%',
            transform: 'translateX(-50%)',
            width: '11px', height: '11px',
            borderRadius: '50%',
            background: '#111',
            border: '2px solid #fff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
          }} />
        </div>

        {/* Hover line */}
        {hovering && (
          <div style={{
            position: 'absolute',
            left: hoverX,
            top: '-6px', bottom: '-6px',
            width: '1px',
            background: 'rgba(0,0,0,0.25)',
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
            zIndex: 4,
          }} />
        )}

        {/* Hover preview — live canvas */}
        {hovering && (
          <div style={{
            position: 'absolute',
            bottom: 'calc(100% + 14px)',
            left: `${Math.max(80, Math.min(hoverX, (timelineRef.current?.offsetWidth || 400) - 80))}px`,
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '5px',
            opacity: hoverPreviewReady ? 1 : 0.4,
            transition: 'opacity 0.1s',
          }}>
            <div style={{
              borderRadius: '7px',
              overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0,0,0,0.28)',
              border: '1.5px solid rgba(255,255,255,0.2)',
              background: '#111',
            }}>
              <canvas id="hover-preview-canvas"
                width={160} height={90}
                style={{ display: 'block' }}
              />
            </div>
            <div style={{
              background: '#111', color: '#fff',
              padding: '3px 9px', borderRadius: '5px',
              fontSize: '10px', fontWeight: '600',
              fontVariantNumeric: 'tabular-nums',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              letterSpacing: '0.01em',
            }}>
              {formatTime(hoverTime)}
            </div>
          </div>
        )}
      </div>

      {/* Controls row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: '12px',
        gap: '8px',
      }}>
        {/* Playback controls */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <CtrlBtn onClick={() => onSeek(Math.max(0, currentTime - 1/30))} title="Step back (←)">
            <FrameBackIcon />
          </CtrlBtn>
          <CtrlBtn onClick={() => {
            const v = videoRef.current
            if (!v) return
            v.paused ? v.play() : v.pause()
          }}>
            <PlayPauseBtn videoRef={videoRef} />
          </CtrlBtn>
          <CtrlBtn onClick={() => onSeek(Math.min(duration, currentTime + 1/30))} title="Step forward (→)">
            <FrameForwardIcon />
          </CtrlBtn>
        </div>

        {/* Speed control */}
        <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
          {SPEEDS.map(s => (
            <button
              key={s}
              onClick={() => onPlaybackRateChange(s)}
              style={{
                padding: '4px 8px',
                borderRadius: '5px',
                border: 'none',
                background: playbackRate === s ? '#111' : 'transparent',
                color: playbackRate === s ? '#fff' : 'var(--text-muted)',
                fontSize: '11px',
                fontWeight: playbackRate === s ? '600' : '400',
                cursor: 'pointer',
                transition: 'all 0.1s',
                fontFamily: 'inherit',
              }}
            >
              {s}×
            </button>
          ))}
        </div>

        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          <kbd style={{
            padding: '1px 5px', borderRadius: '4px',
            background: 'var(--surface-hover)',
            border: '1px solid var(--border)',
            fontSize: '10px', fontFamily: 'inherit',
          }}>Space</kbd> capture · <kbd style={{
            padding: '1px 5px', borderRadius: '4px',
            background: 'var(--surface-hover)',
            border: '1px solid var(--border)',
            fontSize: '10px', fontFamily: 'inherit',
          }}>← →</kbd> step
        </span>
      </div>
    </div>
  )
}

function CtrlBtn({ onClick, title, children }) {
  const [hover, setHover] = useState(false)
  return (
    <button onClick={onClick} title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '32px', height: '32px',
        borderRadius: '7px',
        background: hover ? 'var(--surface-hover)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-primary)',
        transition: 'background 0.1s',
        border: 'none', cursor: 'pointer',
        flexShrink: 0,
      }}
    >{children}</button>
  )
}

function PlayPauseBtn({ videoRef }) {
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    return () => { v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause) }
  }, [videoRef])
  if (playing) return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
    </svg>
  )
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  )
}

function FrameBackIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
}
function FrameForwardIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
}
function Spinner() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2.5" strokeLinecap="round">
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .sp{animation:spin 0.8s linear infinite;transform-origin:center}`}</style>
      <circle className="sp" cx="12" cy="12" r="10" strokeDasharray="40 20"/>
    </svg>
  )
}
