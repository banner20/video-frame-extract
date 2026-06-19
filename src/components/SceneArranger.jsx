import { useState, useRef, useEffect, useCallback } from 'react'

const TRANSITIONS = [
  { id: 'cut',        label: 'Cut',         dur: 0 },
  { id: 'dissolve',   label: 'Dissolve',    dur: 0.8 },
  { id: 'fade-black', label: 'Fade Black',  dur: 1.2 },
  { id: 'fade-white', label: 'Fade White',  dur: 1.0 },
  { id: 'slide-left', label: 'Slide Left',  dur: 0.6 },
  { id: 'slide-right',label: 'Slide Right', dur: 0.6 },
  { id: 'wipe',       label: 'Wipe',        dur: 0.5 },
  { id: 'zoom-in',    label: 'Zoom In',     dur: 0.7 },
]

function mkTransition(type) {
  const def = TRANSITIONS.find(t => t.id === type) || TRANSITIONS[1]
  return { type: def.id, enabled: true, dur: def.dur }
}

// ── Canvas transition renderer ─────────────────────────────────
function renderBlend(ctx, fromVid, toVid, type, p, w, h) {
  ctx.globalAlpha = 1
  switch (type) {
    case 'dissolve':
      ctx.globalAlpha = 1 - p; ctx.drawImage(fromVid, 0, 0, w, h)
      ctx.globalAlpha = p;     ctx.drawImage(toVid,   0, 0, w, h)
      ctx.globalAlpha = 1
      break
    case 'fade-black':
      if (p < 0.5) {
        ctx.drawImage(fromVid, 0, 0, w, h)
        ctx.globalAlpha = p * 2; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h)
      } else {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h)
        ctx.globalAlpha = (p - 0.5) * 2; ctx.drawImage(toVid, 0, 0, w, h)
      }
      ctx.globalAlpha = 1
      break
    case 'fade-white':
      if (p < 0.5) {
        ctx.drawImage(fromVid, 0, 0, w, h)
        ctx.globalAlpha = p * 2; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
      } else {
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
        ctx.globalAlpha = (p - 0.5) * 2; ctx.drawImage(toVid, 0, 0, w, h)
      }
      ctx.globalAlpha = 1
      break
    case 'slide-left':
      ctx.drawImage(fromVid, Math.round(-w * p), 0, w, h)
      ctx.drawImage(toVid,   Math.round(w * (1 - p)), 0, w, h)
      break
    case 'slide-right':
      ctx.drawImage(fromVid, Math.round(w * p), 0, w, h)
      ctx.drawImage(toVid,   Math.round(-w * (1 - p)), 0, w, h)
      break
    case 'wipe':
      ctx.drawImage(fromVid, 0, 0, w, h)
      ctx.save()
      ctx.beginPath(); ctx.rect(0, 0, Math.round(w * p), h); ctx.clip()
      ctx.drawImage(toVid, 0, 0, w, h)
      ctx.restore()
      break
    case 'zoom-in': {
      const scale = 1 + p * 0.3
      const ox = (w * (scale - 1)) / 2, oy = (h * (scale - 1)) / 2
      ctx.drawImage(fromVid, -ox, -oy, w * scale, h * scale)
      ctx.globalAlpha = p; ctx.drawImage(toVid, 0, 0, w, h); ctx.globalAlpha = 1
      break
    }
    default: // cut
      ctx.drawImage(toVid, 0, 0, w, h)
  }
}

// ── Player engine (imperative, lives in a ref) ─────────────────
function createPlayer(canvasRef, videoRefs) {
  let playing = false
  let raf = null

  const canvas = () => canvasRef.current
  const ctx = () => canvas()?.getContext('2d')
  const W = () => canvas()?.width  || 1280
  const H = () => canvas()?.height || 720

  const drawFrame = (vid) => {
    const c = canvas(); if (!c) return
    ctx().drawImage(vid, 0, 0, W(), H())
  }

  const seekReady = (vid, t) => new Promise(r => {
    const handler = () => r()
    vid.addEventListener('seeked', handler, { once: true })
    vid.currentTime = t
  })

  const play = async (clips, transitions, onClipChange) => {
    playing = true

    for (let i = 0; i < clips.length; i++) {
      if (!playing) break
      onClipChange?.(i)
      const clip = clips[i]
      const vid = videoRefs.current[clip.id]
      if (!vid) continue
      await seekReady(vid, 0)
      vid.play()

      const tr = transitions[i]
      const trEnabled = tr?.enabled && tr.type !== 'cut' && i + 1 < clips.length
      const trDur = trEnabled ? (tr.dur || 0.7) : 0

      // Play until transition window or end
      await new Promise(resolve => {
        const tick = () => {
          if (!playing) { resolve(); return }
          drawFrame(vid)
          const remaining = vid.duration - vid.currentTime
          if (trEnabled && remaining <= trDur) { resolve(); return }
          if (vid.ended) { resolve(); return }
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      })
      if (!playing) break

      if (trEnabled && i + 1 < clips.length) {
        vid.pause()
        const nextVid = videoRefs.current[clips[i + 1].id]
        if (!nextVid) continue
        await seekReady(nextVid, 0)
        const t0 = performance.now()
        const durMs = trDur * 1000

        await new Promise(resolve => {
          const frame = () => {
            if (!playing) { resolve(); return }
            const p = Math.min((performance.now() - t0) / durMs, 1)
            renderBlend(ctx(), vid, nextVid, tr.type, p, W(), H())
            if (p < 1) { raf = requestAnimationFrame(frame) } else { resolve() }
          }
          raf = requestAnimationFrame(frame)
        })
      }
    }
    playing = false
  }

  const stop = () => {
    playing = false
    cancelAnimationFrame(raf)
  }

  return { play, stop, isPlaying: () => playing }
}

// ── Transition pill ────────────────────────────────────────────
function TransitionPill({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const isCut = !value.enabled || value.type === 'cut'

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0, userSelect: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {/* toggle on/off */}
        <button
          onClick={() => onChange({ ...value, enabled: !value.enabled })}
          title={value.enabled ? 'Disable transition' : 'Enable transition'}
          style={{
            width: 18, height: 18, borderRadius: 4, border: 'none',
            background: value.enabled ? '#111' : 'var(--border)',
            color: value.enabled ? '#fff' : 'var(--text-muted)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 700, transition: 'all 0.1s', flexShrink: 0,
          }}
        >{value.enabled ? '✓' : '✕'}</button>

        {/* type selector */}
        <button
          onClick={() => setOpen(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 9px', borderRadius: 6, border: '1px solid var(--border)',
            background: isCut ? 'var(--bg)' : 'var(--surface)',
            color: isCut ? 'var(--text-muted)' : 'var(--text-primary)',
            fontSize: 10, fontWeight: 500, cursor: 'pointer',
            fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all 0.1s',
          }}
        >
          <TransIcon type={value.type} />
          {value.enabled ? (TRANSITIONS.find(t => t.id === value.type)?.label ?? 'Cut') : 'Cut'}
          {value.enabled && value.type !== 'cut' && (
            <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>{value.dur.toFixed(1)}s</span>
          )}
          <span style={{ color: 'var(--text-muted)', fontSize: 8 }}>▾</span>
        </button>
      </div>

      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.14)',
          zIndex: 100, minWidth: 190, overflow: 'hidden',
        }}>
          <div style={{ padding: '10px 12px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Transition type
          </div>
          {TRANSITIONS.map(t => (
            <button key={t.id}
              onClick={() => { onChange({ ...value, type: t.id, enabled: t.id !== 'cut', dur: t.id === 'cut' ? 0 : (value.dur || t.dur) }); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '7px 12px',
                background: value.type === t.id && value.enabled ? 'var(--surface-hover)' : 'none',
                border: 'none', cursor: 'pointer', fontSize: 12,
                color: 'var(--text-primary)', fontFamily: 'inherit',
                textAlign: 'left',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = value.type === t.id && value.enabled ? 'var(--surface-hover)' : 'none'}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <TransIcon type={t.id} /> {t.label}
              </span>
              {t.dur > 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.dur}s</span>}
            </button>
          ))}
          {value.enabled && value.type !== 'cut' && (
            <div style={{ padding: '8px 12px 12px', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>Duration</span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{value.dur.toFixed(1)}s</span>
              </div>
              <input type="range" min={0.2} max={3} step={0.1}
                value={value.dur}
                onChange={e => onChange({ ...value, dur: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: '#111', cursor: 'pointer' }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TransIcon({ type }) {
  const icons = { cut: '✕', dissolve: '◈', 'fade-black': '◼', 'fade-white': '◻', 'slide-left': '→', 'slide-right': '←', wipe: '▷', 'zoom-in': '⊕' }
  return <span style={{ fontSize: 10, opacity: 0.7 }}>{icons[type] ?? '◈'}</span>
}

// ── Clip card ──────────────────────────────────────────────────
function ClipCard({ clip, isActive, isDragging, onRemove, onDragStart }) {
  return (
    <div
      style={{
        flexShrink: 0, width: 130, borderRadius: 9, overflow: 'hidden',
        border: `1.5px solid ${isActive ? '#111' : 'var(--border)'}`,
        background: 'var(--surface)',
        boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.18)' : '0 1px 4px rgba(0,0,0,0.06)',
        opacity: isDragging ? 0.5 : 1,
        cursor: 'grab',
        transition: 'border-color 0.15s, opacity 0.15s',
        userSelect: 'none',
      }}
      onMouseDown={onDragStart}
    >
      {/* Thumbnail */}
      <div style={{ position: 'relative', aspectRatio: '16/9', background: '#111', overflow: 'hidden' }}>
        {clip.thumb ? (
          <img src={clip.thumb} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MiniSpinner />
          </div>
        )}
        {isActive && (
          <div style={{ position: 'absolute', inset: 0, border: '2px solid #111', borderRadius: 7, pointerEvents: 'none' }} />
        )}
        {/* remove */}
        <button
          onClick={e => { e.stopPropagation(); onRemove() }}
          style={{
            position: 'absolute', top: 4, right: 4, width: 18, height: 18,
            borderRadius: 4, background: 'rgba(0,0,0,0.65)', border: 'none',
            color: '#fff', fontSize: 10, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >✕</button>
      </div>
      {/* Footer */}
      <div style={{ padding: '5px 8px' }}>
        <p style={{ fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {clip.file.name.replace(/\.[^/.]+$/, '')}
        </p>
        <p style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          {clip.duration > 0 ? `${Math.floor(clip.duration/60)}:${String(Math.floor(clip.duration%60)).padStart(2,'0')}` : '…'}
        </p>
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────
export default function SceneArranger() {
  const [clips, setClips] = useState([])   // [{id, file, thumb, duration}]
  const [transitions, setTransitions] = useState([]) // one per gap: [mkTransition]
  const [dragging, setDragging] = useState(false)    // file drop
  const [activeClip, setActiveClip] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [dragIdx, setDragIdx] = useState(null)       // card drag-to-reorder
  const [dragOverIdx, setDragOverIdx] = useState(null)

  const canvasRef = useRef(null)
  const videoRefs = useRef({})   // id → HTMLVideoElement
  const playerRef = useRef(null)
  const inputRef = useRef(null)
  const timelineRef = useRef(null)

  // Init player engine
  useEffect(() => {
    playerRef.current = createPlayer(canvasRef, videoRefs)
    return () => playerRef.current?.stop()
  }, [])

  // Create/destroy video elements when clips change
  useEffect(() => {
    // Create missing
    clips.forEach(clip => {
      if (!videoRefs.current[clip.id]) {
        const vid = document.createElement('video')
        vid.src = URL.createObjectURL(clip.file)
        vid.muted = true
        vid.preload = 'auto'
        videoRefs.current[clip.id] = vid
      }
    })
    // Release removed
    const ids = new Set(clips.map(c => c.id))
    Object.keys(videoRefs.current).forEach(id => {
      if (!ids.has(id)) {
        const vid = videoRefs.current[id]
        URL.revokeObjectURL(vid.src); vid.src = ''
        delete videoRefs.current[id]
      }
    })
  }, [clips])

  const loadFiles = useCallback(async (files) => {
    const vids = Array.from(files).filter(f => f.type.startsWith('video/'))
    if (!vids.length) return

    const newClips = vids.map(f => ({
      id: `${f.name}_${Date.now()}_${Math.random()}`,
      file: f, thumb: null, duration: 0,
    }))

    setClips(prev => {
      const updated = [...prev, ...newClips]
      // add transitions for each new gap
      setTransitions(tr => {
        const needed = updated.length - 1
        const base = [...tr]
        while (base.length < needed) base.push(mkTransition('dissolve'))
        return base.slice(0, needed)
      })
      return updated
    })

    // Load metadata + thumbnails
    for (const clip of newClips) {
      const url = URL.createObjectURL(clip.file)
      const vid = document.createElement('video')
      vid.src = url; vid.muted = true; vid.preload = 'auto'
      vid.addEventListener('loadedmetadata', () => {
        const dur = vid.duration
        // grab thumb at 10%
        vid.currentTime = Math.min(vid.duration * 0.1, vid.duration - 0.001)
        vid.addEventListener('seeked', () => {
          const scale = Math.min(1, 260 / (vid.videoWidth || 1280))
          const cw = Math.round((vid.videoWidth || 1280) * scale)
          const ch = Math.round((vid.videoHeight || 720) * scale)
          const c = document.createElement('canvas')
          c.width = cw; c.height = ch
          c.getContext('2d').drawImage(vid, 0, 0, cw, ch)
          const thumb = c.toDataURL('image/jpeg', 0.7)
          URL.revokeObjectURL(url); vid.src = ''
          setClips(prev => prev.map(cl => cl.id === clip.id ? { ...cl, thumb, duration: dur } : cl))
        }, { once: true })
      }, { once: true })
    }
  }, [])

  const removeClip = useCallback((idx) => {
    setClips(prev => { const n=[...prev]; n.splice(idx,1); return n })
    setTransitions(prev => {
      const n = [...prev]
      if (n.length > 0) n.splice(Math.min(idx, n.length-1), 1)
      return n
    })
  }, [])

  const handlePlay = async () => {
    if (isPlaying) { playerRef.current?.stop(); setIsPlaying(false); setActiveClip(null); return }
    if (!clips.length) return
    setIsPlaying(true)
    await playerRef.current?.play(clips, transitions, setActiveClip)
    setIsPlaying(false)
    setActiveClip(null)
  }

  const handleExport = async () => {
    if (!clips.length || exporting) return
    const canvas = canvasRef.current
    if (!canvas) return
    setExporting(true)
    playerRef.current?.stop()

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm'
    const stream = canvas.captureStream(30)
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 })
    const chunks = []
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
    recorder.start(200)

    setIsPlaying(true)
    await playerRef.current?.play(clips, transitions, setActiveClip)
    setIsPlaying(false); setActiveClip(null)

    await new Promise(r => { recorder.onstop = r; recorder.stop() })
    const blob = new Blob(chunks, { type: mimeType })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'sequence.webm'; a.click()
    setExporting(false)
  }

  // ── Drag to reorder ────────────────────────────────────────
  const handleCardDragStart = (idx) => (e) => {
    e.preventDefault()
    setDragIdx(idx)
    const onMove = (mv) => {
      const el = timelineRef.current
      if (!el) return
      const cards = [...el.querySelectorAll('[data-clipidx]')]
      let over = idx
      for (const card of cards) {
        const rect = card.getBoundingClientRect()
        if (mv.clientX < rect.right) { over = +card.dataset.clipidx; break }
        over = +card.dataset.clipidx + 1
      }
      setDragOverIdx(Math.min(over, clips.length - 1))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setDragIdx(null)
      setDragOverIdx(null)
      if (dragOverIdx !== null && dragOverIdx !== idx) {
        setClips(prev => {
          const n = [...prev]
          const [item] = n.splice(idx, 1)
          n.splice(dragOverIdx, 0, item)
          return n
        })
        setTransitions(prev => {
          // rebuild transitions after reorder (keep count correct)
          const n = [...prev]
          while (n.length < clips.length - 1) n.push(mkTransition('dissolve'))
          return n.slice(0, clips.length - 1)
        })
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── Drop zone / add button ─────────────────────────────────
  if (!clips.length) return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); loadFiles(e.dataTransfer.files) }}
      style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:36, padding:40 }}
    >
      <div style={{ textAlign:'center' }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:9, marginBottom:8 }}>
          <FilmstripIcon size={20} />
          <span style={{ fontSize:18, fontWeight:600, letterSpacing:'-0.3px' }}>Scene Arranger</span>
        </div>
        <p style={{ color:'var(--text-muted)', fontSize:13 }}>Arrange clips · add transitions · preview & export WebM</p>
      </div>
      <div onClick={() => inputRef.current?.click()}
        style={{
          width:'100%', maxWidth:460, padding:'48px 40px',
          border:`2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius:16, background: dragging ? 'rgba(17,17,17,0.02)' : 'var(--surface)',
          display:'flex', flexDirection:'column', alignItems:'center', gap:12, cursor:'pointer',
          transition:'all 0.15s', transform: dragging ? 'scale(1.01)' : 'scale(1)',
        }}>
        <div style={{ width:48, height:48, borderRadius:12, background: dragging ? 'var(--accent)' : '#f0f0f0', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' }}>
          <UploadIcon color={dragging ? '#fff' : '#888'} />
        </div>
        <div style={{ textAlign:'center' }}>
          <p style={{ fontWeight:500, marginBottom:4 }}>{dragging ? 'Drop your clips!' : 'Drop multiple videos'}</p>
          <p style={{ color:'var(--text-muted)', fontSize:12 }}>or <span style={{ color:'var(--text-primary)', textDecoration:'underline' }}>browse</span> to select files</p>
        </div>
        <p style={{ color:'var(--text-muted)', fontSize:11 }}>MP4, MOV, WebM · arrange in any order</p>
      </div>
      <input ref={inputRef} type="file" accept="video/*" multiple style={{ display:'none' }} onChange={e => loadFiles(e.target.files)} />
      <div style={{ display:'flex', gap:32, color:'var(--text-muted)', fontSize:12 }}>
        {[['01','Drop your clips'],['02','Set transitions'],['03','Preview & export']].map(([n,t]) => (
          <div key={n} style={{ display:'flex', alignItems:'center', gap:7 }}>
            <span style={{ fontSize:10, fontWeight:700, color:'var(--text-primary)', opacity:0.35 }}>{n}</span>
            <span>{t}</span>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

      {/* ── Toolbar ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 20px', borderBottom:'1px solid var(--border)', background:'var(--surface)', flexShrink:0, gap:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <IBtn onClick={() => { playerRef.current?.stop(); setClips([]); setTransitions([]) }} title="Back"><ArrowLeftIcon /></IBtn>
          <div style={{ width:1, height:16, background:'var(--border)' }} />
          <div>
            <p style={{ fontWeight:500, fontSize:13 }}>Scene Arranger</p>
            <p style={{ fontSize:11, color:'var(--text-muted)' }}>{clips.length} clip{clips.length!==1?'s':''} · {transitions.filter(t=>t.enabled&&t.type!=='cut').length} transition{transitions.filter(t=>t.enabled&&t.type!=='cut').length!==1?'s':''}</p>
          </div>
        </div>

        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={() => inputRef.current?.click()}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 13px', borderRadius:7, background:'var(--surface-hover)', color:'var(--text-secondary)', border:'1px solid var(--border)', fontWeight:500, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
            + Add clips
          </button>
          <input ref={inputRef} type="file" accept="video/*" multiple style={{ display:'none' }} onChange={e => loadFiles(e.target.files)} />

          <button onClick={handlePlay} disabled={exporting}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 16px', borderRadius:7, background: isPlaying ? '#ef4444' : 'var(--accent)', color:'#fff', border:'none', fontWeight:500, fontSize:13, cursor:'pointer', fontFamily:'inherit', transition:'background 0.1s' }}>
            {isPlaying ? <StopIcon /> : <PlayIcon />}
            {isPlaying ? 'Stop' : 'Preview'}
          </button>

          <button onClick={handleExport} disabled={isPlaying || exporting || !clips.length}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 15px', borderRadius:7, background:'var(--surface-hover)', color:'var(--text-secondary)', border:'1px solid var(--border)', fontWeight:500, fontSize:12, cursor: exporting ? 'wait' : 'pointer', fontFamily:'inherit', opacity: isPlaying ? 0.5 : 1 }}>
            <ExportIcon /> {exporting ? 'Encoding…' : 'Export WebM'}
          </button>
        </div>
      </div>

      {/* ── Canvas preview ── */}
      <div style={{ flex:1, background:'#0e0e0e', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', minHeight:0 }}>
        <canvas ref={canvasRef} width={1280} height={720}
          style={{ maxWidth:'100%', maxHeight:'100%', display:'block' }}
        />
        {!isPlaying && clips.length > 0 && (
          <div style={{ position:'absolute', display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
            <button onClick={handlePlay}
              style={{ width:56, height:56, borderRadius:'50%', background:'rgba(255,255,255,0.12)', border:'1.5px solid rgba(255,255,255,0.25)', backdropFilter:'blur(8px)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', transition:'transform 0.1s' }}
              onMouseEnter={e => e.currentTarget.style.transform='scale(1.08)'}
              onMouseLeave={e => e.currentTarget.style.transform='scale(1)'}
            >
              <PlayIcon size={22} />
            </button>
            <span style={{ color:'rgba(255,255,255,0.45)', fontSize:11 }}>Click to preview sequence</span>
          </div>
        )}
      </div>

      {/* ── Timeline strip ── */}
      <div style={{ flexShrink:0, borderTop:'1px solid var(--border)', background:'var(--bg)', padding:'14px 20px', overflowX:'auto' }}>
        <div ref={timelineRef} style={{ display:'flex', alignItems:'center', gap:0, width:'max-content', minWidth:'100%' }}>
          {clips.map((clip, i) => (
            <div key={clip.id} style={{ display:'flex', alignItems:'center' }}>
              <div data-clipidx={i}>
                <ClipCard
                  clip={clip}
                  isActive={activeClip === i}
                  isDragging={dragIdx === i}
                  onRemove={() => removeClip(i)}
                  onDragStart={handleCardDragStart(i)}
                />
              </div>

              {/* Transition pill after each clip except last */}
              {i < clips.length - 1 && (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'0 10px', flexShrink:0 }}>
                  <TransitionPill
                    value={transitions[i] ?? mkTransition('dissolve')}
                    onChange={tr => setTransitions(prev => {
                      const n = [...prev]
                      while (n.length <= i) n.push(mkTransition('dissolve'))
                      n[i] = tr
                      return n
                    })}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Icons
function ArrowLeftIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> }
function PlayIcon({ size=13 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> }
function StopIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg> }
function ExportIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> }
function FilmstripIcon({ size=20 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="17" y1="7" x2="22" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/></svg> }
function UploadIcon({ color='#888' }) { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg> }
function MiniSpinner() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2.5"><style>{`@keyframes sa{to{transform:rotate(360deg)}} .sa{animation:sa 0.9s linear infinite;transform-origin:12px 12px}`}</style><circle className="sa" cx="12" cy="12" r="9" strokeDasharray="36 18"/></svg> }
function IBtn({ onClick, title, children }) {
  return <button onClick={onClick} title={title} style={{ width:30, height:30, borderRadius:7, background:'transparent', color:'var(--text-secondary)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.1s' }} onMouseEnter={e=>e.currentTarget.style.background='var(--surface-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>{children}</button>
}
