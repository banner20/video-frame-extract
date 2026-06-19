import { useState, useRef, useEffect, useCallback } from 'react'
import Timeline from './Timeline'
import FrameStrip from './FrameStrip'
import ExportPanel from './ExportPanel'
import FrameModal from './FrameModal'
import ExtractStudio from './ExtractStudio'

export default function FrameStudio({ video, onReset }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const autoCapIntervalRef = useRef(null)

  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [selectedFrames, setSelectedFrames] = useState([])
  const [captureFlash, setCaptureFlash] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [previewFrame, setPreviewFrame] = useState(null) // for modal
  const [extractFrame, setExtractFrame] = useState(null) // for extract studio
  const [autoCapInterval, setAutoCapInterval] = useState(null) // null = off, number = seconds
  const [autoCapRunning, setAutoCapRunning] = useState(false)
  const [showAutoCapMenu, setShowAutoCapMenu] = useState(false)

  useEffect(() => {
    const vid = videoRef.current
    if (!vid) return
    const onMeta = () => { setDuration(vid.duration); setVideoReady(true) }
    const onTime = () => setCurrentTime(vid.currentTime)
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    vid.addEventListener('loadedmetadata', onMeta)
    vid.addEventListener('timeupdate', onTime)
    vid.addEventListener('play', onPlay)
    vid.addEventListener('pause', onPause)
    return () => {
      vid.removeEventListener('loadedmetadata', onMeta)
      vid.removeEventListener('timeupdate', onTime)
      vid.removeEventListener('play', onPlay)
      vid.removeEventListener('pause', onPause)
    }
  }, [])

  // Sync playback rate
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate
  }, [playbackRate])

  const doCapture = useCallback(() => {
    const vid = videoRef.current
    const canvas = canvasRef.current
    if (!vid || !canvas || !videoReady) return null

    setCaptureFlash(true)
    setTimeout(() => setCaptureFlash(false), 150)

    canvas.width = vid.videoWidth
    canvas.height = vid.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(vid, 0, 0)
    const dataUrl = canvas.toDataURL('image/png')
    const time = vid.currentTime

    setSelectedFrames(prev => {
      const isDupe = prev.some(f => Math.abs(f.time - time) < 0.04)
      if (isDupe) return prev
      return [...prev, { time, dataUrl, id: `${time}_${Date.now()}` }]
        .sort((a, b) => a.time - b.time)
    })
    return dataUrl
  }, [videoReady])

  const seekTo = useCallback((time) => {
    const vid = videoRef.current
    if (!vid) return
    vid.currentTime = time
    setCurrentTime(time)
  }, [])

  const removeFrame = useCallback((id) => {
    setSelectedFrames(prev => prev.filter(f => f.id !== id))
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT') return
      const vid = videoRef.current
      if (!vid) return
      if (e.code === 'Space') {
        e.preventDefault()
        doCapture()
      }
      if (e.code === 'ArrowLeft') {
        e.preventDefault()
        const step = e.shiftKey ? 1 : 1 / 30
        seekTo(Math.max(0, vid.currentTime - step))
      }
      if (e.code === 'ArrowRight') {
        e.preventDefault()
        const step = e.shiftKey ? 1 : 1 / 30
        seekTo(Math.min(duration, vid.currentTime + step))
      }
      if (e.code === 'KeyP' || e.code === 'KeyK') {
        e.preventDefault()
        vid.paused ? vid.play() : vid.pause()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [doCapture, seekTo, duration])

  // Auto-capture runner
  const startAutoCapture = useCallback((intervalSec) => {
    if (autoCapIntervalRef.current) clearInterval(autoCapIntervalRef.current)
    const vid = videoRef.current
    if (!vid) return
    vid.play()
    setAutoCapRunning(true)
    setAutoCapInterval(intervalSec)
    setShowAutoCapMenu(false)

    autoCapIntervalRef.current = setInterval(() => {
      const v = videoRef.current
      if (!v || v.ended || v.paused) {
        stopAutoCapture()
        return
      }
      doCapture()
    }, intervalSec * 1000)
  }, [doCapture])

  const stopAutoCapture = useCallback(() => {
    if (autoCapIntervalRef.current) {
      clearInterval(autoCapIntervalRef.current)
      autoCapIntervalRef.current = null
    }
    setAutoCapRunning(false)
    videoRef.current?.pause()
  }, [])

  useEffect(() => () => {
    if (autoCapIntervalRef.current) clearInterval(autoCapIntervalRef.current)
  }, [])

  const formatTime = (s) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    const ms = Math.floor((s % 1) * 100)
    return `${m}:${String(sec).padStart(2, '0')}.${String(ms).padStart(2, '0')}`
  }

  const AUTO_INTERVALS = [0.5, 1, 2, 5, 10]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        flexShrink: 0,
        gap: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <button onClick={onReset} title="Back"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '30px', height: '30px', borderRadius: '7px',
              background: 'transparent', color: 'var(--text-secondary)',
              border: 'none', cursor: 'pointer', flexShrink: 0,
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <ArrowLeftIcon />
          </button>
          <div style={{ width: '1px', height: '16px', background: 'var(--border)', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: '500', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {video.name.length > 48 ? video.name.slice(0, 48) + '…' : video.name}
            </p>
            {duration > 0 && (
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {formatTime(duration)}
                {selectedFrames.length > 0 && ` · ${selectedFrames.length} frame${selectedFrames.length !== 1 ? 's' : ''} selected`}
              </p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '7px', alignItems: 'center', flexShrink: 0 }}>
          {/* Auto-capture button */}
          {videoReady && (
            <div style={{ position: 'relative' }}>
              {autoCapRunning ? (
                <button
                  onClick={stopAutoCapture}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '7px 13px', borderRadius: '7px',
                    background: '#fef2f2', color: '#ef4444',
                    border: '1px solid #fecaca',
                    fontWeight: '500', fontSize: '12px', cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <StopIcon /> Stop auto ({autoCapInterval}s)
                </button>
              ) : (
                <button
                  onClick={() => setShowAutoCapMenu(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '7px 13px', borderRadius: '7px',
                    background: 'var(--surface-hover)', color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                    fontWeight: '500', fontSize: '12px', cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'all 0.1s',
                  }}
                >
                  <AutoIcon /> Auto-capture
                </button>
              )}
              {showAutoCapMenu && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  zIndex: 50,
                  overflow: 'hidden',
                  minWidth: '160px',
                }}>
                  <div style={{ padding: '10px 12px 6px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' }}>
                    Capture every…
                  </div>
                  {AUTO_INTERVALS.map(sec => (
                    <button key={sec}
                      onClick={() => startAutoCapture(sec)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '8px 14px', background: 'none',
                        border: 'none', cursor: 'pointer',
                        fontSize: '13px', color: 'var(--text-primary)',
                        fontFamily: 'inherit',
                        transition: 'background 0.08s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      {sec < 1 ? `${sec * 1000}ms` : `${sec}s`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedFrames.length > 0 && (
            <button
              onClick={() => setExportOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '7px 15px', borderRadius: '7px',
                background: 'var(--accent)', color: '#fff',
                fontWeight: '500', fontSize: '13px',
                border: 'none', cursor: 'pointer',
                transition: 'background 0.1s',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--accent)'}
            >
              <DownloadIcon />
              Export {selectedFrames.length}
            </button>
          )}
        </div>
      </div>

      {/* Main area: video + frame strip stacked vertically */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Video */}
        <div style={{
          flex: 1,
          position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#f7f7f7',
          overflow: 'hidden',
          minHeight: 0,
        }}>
          <video
            ref={videoRef}
            src={video.url}
            style={{ maxWidth: '100%', maxHeight: '100%', display: 'block', borderRadius: '3px' }}
          />

          {/* Flash */}
          {captureFlash && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'rgba(255,255,255,0.65)',
              pointerEvents: 'none',
            }} />
          )}

          {/* Auto-capture indicator */}
          {autoCapRunning && (
            <div style={{
              position: 'absolute', top: '14px', left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(239,68,68,0.9)',
              color: '#fff',
              padding: '5px 12px', borderRadius: '100px',
              fontSize: '12px', fontWeight: '600',
              display: 'flex', alignItems: 'center', gap: '6px',
              backdropFilter: 'blur(6px)',
              boxShadow: '0 2px 10px rgba(239,68,68,0.4)',
            }}>
              <PulseIcon /> Auto-capturing every {autoCapInterval}s
            </div>
          )}

          {/* Capture button — only visible when paused */}
          {videoReady && !isPlaying && !autoCapRunning && (
            <div style={{
              position: 'absolute', bottom: '20px', left: '50%',
              transform: 'translateX(-50%)',
            }}>
              <button
                onClick={doCapture}
                title="Capture frame (Space)"
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '10px 20px', borderRadius: '100px',
                  background: 'rgba(17,17,17,0.82)',
                  backdropFilter: 'blur(10px)',
                  color: '#fff', fontWeight: '500', fontSize: '13px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
                  border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit',
                  letterSpacing: '0.01em',
                  transition: 'transform 0.1s, opacity 0.1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
              >
                <CameraIcon />
                Capture Frame
                <span style={{
                  padding: '2px 6px', borderRadius: '5px',
                  background: 'rgba(255,255,255,0.15)',
                  fontSize: '10px', color: 'rgba(255,255,255,0.65)', fontWeight: '400',
                }}>Space</span>
              </button>
            </div>
          )}

          {/* Playing hint */}
          {videoReady && isPlaying && (
            <div style={{
              position: 'absolute', bottom: '16px', right: '16px',
              background: 'rgba(0,0,0,0.5)',
              color: 'rgba(255,255,255,0.8)',
              backdropFilter: 'blur(6px)',
              padding: '4px 10px', borderRadius: '6px',
              fontSize: '11px', fontWeight: '500',
            }}>
              Pause to capture
            </div>
          )}
        </div>

        {/* Frame strip (horizontal, below video) */}
        {selectedFrames.length > 0 && (
          <FrameStrip
            frames={selectedFrames}
            onRemove={removeFrame}
            onSeek={seekTo}
            onPreview={setPreviewFrame}
            onExtract={setExtractFrame}
            formatTime={formatTime}
          />
        )}

        {/* Timeline */}
        {videoReady && (
          <Timeline
            videoRef={videoRef}
            videoSrc={video.url}
            duration={duration}
            currentTime={currentTime}
            selectedFrames={selectedFrames}
            onSeek={seekTo}
            playbackRate={playbackRate}
            onPlaybackRateChange={(r) => setPlaybackRate(r)}
          />
        )}
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {exportOpen && (
        <ExportPanel
          frames={selectedFrames}
          videoName={video.name}
          onClose={() => setExportOpen(false)}
        />
      )}

      {previewFrame && (
        <FrameModal
          frame={previewFrame}
          formatTime={formatTime}
          onClose={() => setPreviewFrame(null)}
          onRemove={(id) => { removeFrame(id); setPreviewFrame(null) }}
          onExtract={() => { setExtractFrame(previewFrame); setPreviewFrame(null) }}
        />
      )}

      {extractFrame && (
        <ExtractStudio
          frame={extractFrame}
          formatTime={formatTime}
          onClose={() => setExtractFrame(null)}
        />
      )}
    </div>
  )
}

function ArrowLeftIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
}
function CameraIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
}
function DownloadIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
}
function AutoIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
}
function StopIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
}
function PulseIcon() {
  return (
    <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: '#fff', animation: 'pulse 1s ease-in-out infinite' }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </span>
  )
}
