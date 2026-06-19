import { useState, useRef, useCallback, useEffect } from 'react'
import JSZip from 'jszip'

const SAMPLE_W = 64
const SAMPLE_H = 36

function fmt(s) {
  const m = Math.floor(s / 60)
  const sec = String(Math.floor(s % 60)).padStart(2, '0')
  const ms = String(Math.floor((s % 1) * 10))
  return `${m}:${sec}.${ms}`
}
function fmtShort(s) {
  return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`
}

async function analyzeScenes(url, duration, sensitivity, onProgress, cancelRef) {
  const threshold = (1 - sensitivity / 100) * 70 + 8

  const vid = document.createElement('video')
  vid.src = url; vid.muted = true; vid.preload = 'auto'
  await new Promise(r => vid.addEventListener('loadedmetadata', r, { once: true }))

  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE_W; canvas.height = SAMPLE_H
  const ctx = canvas.getContext('2d')

  const interval = Math.max(0.25, duration / 600) // max 600 samples
  const cuts = [0]
  let prev = null
  let i = 0

  for (let t = interval; t < duration; t += interval) {
    if (cancelRef.current) break
    vid.currentTime = t
    await new Promise(r => vid.addEventListener('seeked', r, { once: true }))
    ctx.drawImage(vid, 0, 0, SAMPLE_W, SAMPLE_H)
    const px = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data

    if (prev) {
      let diff = 0
      for (let j = 0; j < px.length; j += 4) {
        diff += Math.abs(px[j] - prev[j]) + Math.abs(px[j+1] - prev[j+1]) + Math.abs(px[j+2] - prev[j+2])
      }
      diff /= SAMPLE_W * SAMPLE_H * 3
      if (diff > threshold) cuts.push(t)
    }

    prev = new Uint8ClampedArray(px)
    i++
    onProgress(t / duration)
    if (i % 15 === 0) await new Promise(r => setTimeout(r, 0))
  }

  cuts.push(duration)
  vid.src = ''
  return cuts
}

async function grabThumb(url, time, vw, vh) {
  const vid = document.createElement('video')
  vid.src = url; vid.muted = true; vid.preload = 'auto'
  await new Promise(r => vid.addEventListener('loadedmetadata', r, { once: true }))
  vid.currentTime = time
  await new Promise(r => vid.addEventListener('seeked', r, { once: true }))
  const scale = Math.min(1, 280 / (vw || 1280))
  const cw = Math.round((vw || 1280) * scale)
  const ch = Math.round((vh || 720) * scale)
  const c = document.createElement('canvas')
  c.width = cw; c.height = ch
  c.getContext('2d').drawImage(vid, 0, 0, cw, ch)
  vid.src = ''
  return c.toDataURL('image/jpeg', 0.7)
}

export default function SceneCutter() {
  const [video, setVideo] = useState(null)
  const [scenes, setScenes] = useState([])
  const [thumbs, setThumbs] = useState([])
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [sensitivity, setSensitivity] = useState(62)
  const [selected, setSelected] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [vidDims, setVidDims] = useState({ w: 1280, h: 720 })

  const videoRef = useRef(null)
  const inputRef = useRef(null)
  const cancelRef = useRef(false)
  const stripRef = useRef(null)

  const handleFile = useCallback((file) => {
    if (!file?.type.startsWith('video/')) return
    const url = URL.createObjectURL(file)
    setVideo({ file, url, name: file.name })
    setScenes([]); setThumbs([]); setSelected(null)
  }, [])

  useEffect(() => {
    if (!video) return
    const vid = document.createElement('video')
    vid.src = video.url
    vid.addEventListener('loadedmetadata', () => {
      setVidDims({ w: vid.videoWidth || 1280, h: vid.videoHeight || 720 })
      vid.src = ''
    })
  }, [video])

  const handleAnalyze = async () => {
    if (!video) return
    cancelRef.current = false
    setScanning(true); setScanProgress(0); setScenes([]); setThumbs([]); setSelected(null)

    const vid2 = document.createElement('video')
    vid2.src = video.url; vid2.preload = 'metadata'
    await new Promise(r => vid2.addEventListener('loadedmetadata', r, { once: true }))
    const duration = vid2.duration
    vid2.src = ''

    const cuts = await analyzeScenes(video.url, duration, sensitivity, setScanProgress, cancelRef)
    const newScenes = cuts.slice(0, -1).map((t, i) => ({
      i, start: t, end: cuts[i + 1], dur: cuts[i + 1] - t,
    }))
    setScenes(newScenes)
    setScanning(false)
    setSelected(0)

    // thumbnails one by one
    const newThumbs = []
    for (const scene of newScenes) {
      if (cancelRef.current) break
      const t = scene.start + scene.dur * 0.2
      const thumb = await grabThumb(video.url, t, vidDims.w, vidDims.h)
      newThumbs.push(thumb)
      setThumbs([...newThumbs])
    }
  }

  const handleCancel = () => { cancelRef.current = true; setScanning(false) }

  const handleSceneClick = (scene) => {
    setSelected(scene.i)
    const vid = videoRef.current
    if (vid) { vid.currentTime = scene.start; vid.play() }
    // scroll to card
    const card = stripRef.current?.querySelector(`[data-si="${scene.i}"]`)
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }

  // Stop video at scene end
  useEffect(() => {
    const vid = videoRef.current
    if (!vid || selected === null || !scenes[selected]) return
    const scene = scenes[selected]
    const check = () => { if (vid.currentTime >= scene.end) { vid.pause(); vid.currentTime = scene.end } }
    vid.addEventListener('timeupdate', check)
    return () => vid.removeEventListener('timeupdate', check)
  }, [selected, scenes])

  const handleExport = async () => {
    if (!thumbs.length) return
    setExporting(true)
    const zip = new JSZip()
    scenes.forEach((s, i) => {
      if (!thumbs[i]) return
      const name = `scene_${String(i+1).padStart(3,'0')}_${fmtShort(s.start).replace(':','-')}.jpg`
      zip.file(name, thumbs[i].split(',')[1], { base64: true })
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'scenes.zip'; a.click()
    setExporting(false)
  }

  // ── Drop zone ──────────────────────────────────────────
  if (!video) return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
      style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:36, padding:40 }}
    >
      <div style={{ textAlign:'center' }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:9, marginBottom:8 }}>
          <ScissorsIcon size={20} />
          <span style={{ fontSize:18, fontWeight:600, letterSpacing:'-0.3px' }}>Scene Cutter</span>
        </div>
        <p style={{ color:'var(--text-muted)', fontSize:13 }}>Auto-detect scene changes · browse · export thumbnails</p>
      </div>
      <div onClick={() => inputRef.current?.click()}
        style={{
          width:'100%', maxWidth:440, padding:'48px 40px',
          border:`2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius:16, background: dragging ? 'rgba(17,17,17,0.02)' : 'var(--surface)',
          display:'flex', flexDirection:'column', alignItems:'center', gap:12, cursor:'pointer',
          transition:'all 0.15s', transform: dragging ? 'scale(1.01)' : 'scale(1)',
        }}>
        <div style={{ width:48, height:48, borderRadius:12, background: dragging ? 'var(--accent)' : '#f0f0f0', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' }}>
          <UploadIcon color={dragging ? '#fff' : '#888'} />
        </div>
        <div style={{ textAlign:'center' }}>
          <p style={{ fontWeight:500, marginBottom:4 }}>{dragging ? 'Drop it!' : 'Drop a video here'}</p>
          <p style={{ color:'var(--text-muted)', fontSize:12 }}>or <span style={{ color:'var(--text-primary)', textDecoration:'underline' }}>browse</span></p>
        </div>
      </div>
      <input ref={inputRef} type="file" accept="video/*" style={{ display:'none' }} onChange={e => handleFile(e.target.files[0])} />
      <div style={{ display:'flex', gap:32, color:'var(--text-muted)', fontSize:12 }}>
        {[['01','Drop a video'],['02','Click Analyze'],['03','Browse scenes']].map(([n,t]) => (
          <div key={n} style={{ display:'flex', alignItems:'center', gap:7 }}>
            <span style={{ fontSize:10, fontWeight:700, color:'var(--text-primary)', opacity:0.35 }}>{n}</span>
            <span>{t}</span>
          </div>
        ))}
      </div>
    </div>
  )

  const selScene = selected !== null ? scenes[selected] : null

  // ── Main view ──────────────────────────────────────────
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 20px', borderBottom:'1px solid var(--border)', background:'var(--surface)', flexShrink:0, gap:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <Btn icon onClick={() => setVideo(null)} title="Back"><ArrowLeftIcon /></Btn>
          <div style={{ width:1, height:16, background:'var(--border)' }} />
          <div>
            <p style={{ fontWeight:500, fontSize:13 }}>{video.name.length > 40 ? video.name.slice(0,40)+'…' : video.name}</p>
            <p style={{ fontSize:11, color:'var(--text-muted)' }}>
              {scenes.length > 0 ? `${scenes.length} scenes detected` : 'No scenes yet'}
            </p>
          </div>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          {/* Sensitivity */}
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:11, color:'var(--text-muted)', whiteSpace:'nowrap' }}>Sensitivity</span>
            <input type="range" min={10} max={95} value={sensitivity} onChange={e => setSensitivity(+e.target.value)}
              style={{ width:80, accentColor:'#111', cursor:'pointer' }} disabled={scanning} />
            <span style={{ fontSize:11, color:'var(--text-secondary)', minWidth:24, fontVariantNumeric:'tabular-nums' }}>{sensitivity}</span>
          </div>

          {scanning ? (
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:120, height:4, borderRadius:2, background:'var(--border)', overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${scanProgress*100}%`, background:'#111', transition:'width 0.1s' }} />
              </div>
              <span style={{ fontSize:11, color:'var(--text-muted)' }}>{Math.round(scanProgress*100)}%</span>
              <button onClick={handleCancel}
                style={{ padding:'6px 12px', borderRadius:6, border:'1px solid var(--border)', background:'transparent', fontSize:12, cursor:'pointer', fontFamily:'inherit', color:'var(--text-secondary)' }}>
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={handleAnalyze}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:7, background:'var(--accent)', color:'#fff', border:'none', fontWeight:500, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
              <ScanIcon /> Analyze
            </button>
          )}

          {thumbs.length > 0 && (
            <button onClick={handleExport} disabled={exporting}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:7, background:'var(--surface-hover)', color:'var(--text-secondary)', border:'1px solid var(--border)', fontWeight:500, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
              <DownloadIcon /> {exporting ? 'Zipping…' : `Export ${scenes.length} thumbnails`}
            </button>
          )}
        </div>
      </div>

      {/* Video player area */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minHeight:0 }}>
        <div style={{ flex:1, position:'relative', background:'#0e0e0e', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', minHeight:0 }}>
          <video ref={videoRef} src={video.url}
            style={{ maxWidth:'100%', maxHeight:'100%', display:'block' }}
            controls
          />
          {selScene && (
            <div style={{ position:'absolute', top:12, left:'50%', transform:'translateX(-50%)', background:'rgba(0,0,0,0.65)', backdropFilter:'blur(6px)', color:'#fff', padding:'5px 14px', borderRadius:8, fontSize:12, fontWeight:500, whiteSpace:'nowrap' }}>
              Scene {selScene.i + 1} / {scenes.length} · {fmtShort(selScene.start)} → {fmtShort(selScene.end)} · {selScene.dur.toFixed(1)}s
            </div>
          )}
        </div>

        {/* Scene strip */}
        {scenes.length > 0 && (
          <div ref={stripRef}
            style={{ flexShrink:0, height:138, background:'var(--bg)', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8, padding:'0 16px', overflowX:'auto', overflowY:'hidden' }}>
            {scenes.map((scene, i) => (
              <div key={i} data-si={i} onClick={() => handleSceneClick(scene)}
                style={{
                  flexShrink:0, width:110, height:110, borderRadius:9, overflow:'hidden', cursor:'pointer',
                  border:`2px solid ${selected === i ? '#111' : 'transparent'}`,
                  boxShadow: selected === i ? '0 0 0 3px rgba(17,17,17,0.12)' : '0 1px 4px rgba(0,0,0,0.1)',
                  background:'#111', position:'relative', transition:'border-color 0.15s, box-shadow 0.15s',
                  display:'flex', flexDirection:'column',
                }}>
                {/* Thumbnail */}
                <div style={{ flex:1, overflow:'hidden', position:'relative' }}>
                  {thumbs[i] ? (
                    <img src={thumbs[i]} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} alt="" />
                  ) : (
                    <div style={{ width:'100%', height:'100%', background:'#1c1c1c', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {scanning && i >= thumbs.length ? <MiniSpinner /> : null}
                    </div>
                  )}
                  {/* Scene number badge */}
                  <div style={{ position:'absolute', top:5, left:5, background:'rgba(0,0,0,0.7)', color:'#fff', fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:4, letterSpacing:'0.02em' }}>
                    S{i + 1}
                  </div>
                </div>
                {/* Footer */}
                <div style={{ background: selected === i ? '#111' : '#1a1a1a', padding:'4px 7px' }}>
                  <p style={{ fontSize:10, color: selected === i ? '#fff' : 'rgba(255,255,255,0.5)', fontVariantNumeric:'tabular-nums' }}>{fmtShort(scene.start)}</p>
                  <p style={{ fontSize:9, color:'rgba(255,255,255,0.35)' }}>{scene.dur.toFixed(1)}s</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!scanning && scenes.length === 0 && (
          <div style={{ flexShrink:0, height:80, display:'flex', alignItems:'center', justifyContent:'center', borderTop:'1px solid var(--border)', background:'var(--bg)' }}>
            <p style={{ color:'var(--text-muted)', fontSize:13 }}>Click <strong>Analyze</strong> to detect scene cuts</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Btn({ onClick, title, icon, children, disabled, style: s }) {
  return (
    <button onClick={onClick} title={title} disabled={disabled}
      style={{ width: icon ? 30 : undefined, height: icon ? 30 : undefined, borderRadius:7, background:'transparent', color:'var(--text-secondary)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.1s', ...s }}
      onMouseEnter={e => e.currentTarget.style.background='var(--surface-hover)'}
      onMouseLeave={e => e.currentTarget.style.background='transparent'}
    >{children}</button>
  )
}
function ArrowLeftIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> }
function ScissorsIcon({ size=20 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg> }
function ScanIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg> }
function DownloadIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> }
function UploadIcon({ color='#888' }) { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg> }
function MiniSpinner() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2.5"><style>{`@keyframes sc{to{transform:rotate(360deg)}} .sc{animation:sc 0.9s linear infinite;transform-origin:12px 12px}`}</style><circle className="sc" cx="12" cy="12" r="9" strokeDasharray="36 18"/></svg> }
