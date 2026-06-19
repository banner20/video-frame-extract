import { useState, useRef, useEffect, useCallback } from 'react'

const TRANSITIONS = [
  { id: 'cut',         label: 'Cut',          dur: 0   },
  { id: 'dissolve',    label: 'Dissolve',     dur: 0.8 },
  { id: 'fade-black',  label: 'Fade Black',   dur: 1.2 },
  { id: 'fade-white',  label: 'Fade White',   dur: 1.0 },
  { id: 'slide-left',  label: 'Slide Left',   dur: 0.6 },
  { id: 'slide-right', label: 'Slide Right',  dur: 0.6 },
  { id: 'wipe',        label: 'Wipe',         dur: 0.5 },
  { id: 'zoom-in',     label: 'Zoom In',      dur: 0.7 },
]

function mkTr(type) {
  const d = TRANSITIONS.find(t => t.id === type) || TRANSITIONS[1]
  return { type: d.id, enabled: d.id !== 'cut', dur: d.dur || 0.8 }
}

function renderBlend(ctx, fromEl, toEl, type, p, w, h) {
  ctx.globalAlpha = 1
  switch (type) {
    case 'dissolve':
      ctx.globalAlpha = 1-p; ctx.drawImage(fromEl,0,0,w,h)
      ctx.globalAlpha = p;   ctx.drawImage(toEl,0,0,w,h); ctx.globalAlpha=1; break
    case 'fade-black':
      if (p<0.5){ ctx.drawImage(fromEl,0,0,w,h); ctx.globalAlpha=p*2; ctx.fillStyle='#000'; ctx.fillRect(0,0,w,h) }
      else { ctx.fillStyle='#000'; ctx.fillRect(0,0,w,h); ctx.globalAlpha=(p-0.5)*2; ctx.drawImage(toEl,0,0,w,h) }
      ctx.globalAlpha=1; break
    case 'fade-white':
      if (p<0.5){ ctx.drawImage(fromEl,0,0,w,h); ctx.globalAlpha=p*2; ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h) }
      else { ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h); ctx.globalAlpha=(p-0.5)*2; ctx.drawImage(toEl,0,0,w,h) }
      ctx.globalAlpha=1; break
    case 'slide-left':
      ctx.drawImage(fromEl, Math.round(-w*p),0,w,h); ctx.drawImage(toEl, Math.round(w*(1-p)),0,w,h); break
    case 'slide-right':
      ctx.drawImage(fromEl, Math.round(w*p),0,w,h); ctx.drawImage(toEl, Math.round(-w*(1-p)),0,w,h); break
    case 'wipe':
      ctx.drawImage(fromEl,0,0,w,h); ctx.save()
      ctx.beginPath(); ctx.rect(0,0,Math.round(w*p),h); ctx.clip()
      ctx.drawImage(toEl,0,0,w,h); ctx.restore(); break
    case 'zoom-in': {
      const sc=1+p*0.3
      ctx.drawImage(fromEl,-(w*(sc-1))/2,-(h*(sc-1))/2,w*sc,h*sc)
      ctx.globalAlpha=p; ctx.drawImage(toEl,0,0,w,h); ctx.globalAlpha=1; break
    }
    default: ctx.drawImage(toEl,0,0,w,h)
  }
}

// ── Player (supports video + image media) ────────────────────────
function createPlayer(canvasRef, mediaRefs) {
  let playing=false, raf=null
  const cv  = () => canvasRef.current
  const ctx = () => cv()?.getContext('2d')
  const W   = () => cv()?.width  || 1280
  const H   = () => cv()?.height || 720
  const seekReady = (vid, t) => new Promise(r => { vid.addEventListener('seeked',r,{once:true}); vid.currentTime=t })

  const play = async (clips, transitions, onClipChange) => {
    playing = true
    for (let i=0; i<clips.length; i++) {
      if (!playing) break
      onClipChange?.(i)
      const clip  = clips[i]
      const media = mediaRefs.current[clip.id]
      if (!media) continue
      const tr    = transitions[i]
      const trOn  = tr?.enabled && tr.type!=='cut' && i+1<clips.length
      const trDur = trOn ? (tr.dur||0.7) : 0
      const startOff = clip.startOffset || 0
      const clipDur  = clip.clipDuration > 0
        ? Math.min(clip.clipDuration, clip.duration - startOff)
        : (clip.duration - startOff)

      if (media.type==='video') {
        await seekReady(media.el, startOff)
        media.el.play()
        await new Promise(resolve => {
          const t0=performance.now()
          const tick=()=>{
            if (!playing){resolve();return}
            ctx()?.drawImage(media.el,0,0,W(),H())
            const elapsed=(performance.now()-t0)/1000
            if (trOn && clipDur-elapsed<=trDur){resolve();return}
            if (elapsed>=clipDur||media.el.ended){resolve();return}
            raf=requestAnimationFrame(tick)
          }
          raf=requestAnimationFrame(tick)
        })
        media.el.pause()
      } else {
        await new Promise(resolve => {
          const t0=performance.now()
          const tick=()=>{
            if (!playing){resolve();return}
            ctx()?.drawImage(media.el,0,0,W(),H())
            const elapsed=(performance.now()-t0)/1000
            if (trOn && clipDur-elapsed<=trDur){resolve();return}
            if (elapsed>=clipDur){resolve();return}
            raf=requestAnimationFrame(tick)
          }
          raf=requestAnimationFrame(tick)
        })
      }

      if (!playing) break
      if (trOn && i+1<clips.length) {
        const next=mediaRefs.current[clips[i+1].id]
        if (!next) continue
        if (next.type==='video') await seekReady(next.el, clips[i+1].startOffset||0)
        const t0=performance.now(), durMs=trDur*1000
        await new Promise(resolve=>{
          const frame=()=>{
            if (!playing){resolve();return}
            const p=Math.min((performance.now()-t0)/durMs,1)
            renderBlend(ctx(),media.el,next.el,tr.type,p,W(),H())
            if (p<1){raf=requestAnimationFrame(frame)}else{resolve()}
          }
          raf=requestAnimationFrame(frame)
        })
      }
    }
    playing=false
  }

  return { play, stop:()=>{playing=false;cancelAnimationFrame(raf)}, isPlaying:()=>playing }
}

// ── Config Modal ─────────────────────────────────────────────────
function ConfigModal({ files, onConfirm, onCancel }) {
  const hasImages = files.some(f => f.type.startsWith('image/'))
  const [durMode, setDurMode]   = useState(hasImages ? 'custom' : 'full')
  const [customDur, setCustomDur] = useState('3')
  const [defaultTr, setDefaultTr] = useState('dissolve')
  const vidCount = files.filter(f=>f.type.startsWith('video/')).length
  const imgCount = files.filter(f=>f.type.startsWith('image/')).length

  const confirm = () => {
    const d = Math.max(0.5, parseFloat(customDur)||3)
    onConfirm({ durMode: hasImages?'custom':durMode, customDur: d, defaultTr })
  }

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,backdropFilter:'blur(6px)' }}>
      <div style={{ background:'var(--surface)',borderRadius:16,border:'1px solid var(--border)',boxShadow:'0 24px 64px rgba(0,0,0,0.18)',width:480,padding:'28px 32px',maxHeight:'90vh',overflowY:'auto' }}>
        <h2 style={{ fontWeight:600,fontSize:17,marginBottom:4 }}>Configure Sequence</h2>
        <p style={{ color:'var(--text-muted)',fontSize:12,marginBottom:24 }}>
          {[vidCount>0&&`${vidCount} video${vidCount!==1?'s':''}`,imgCount>0&&`${imgCount} image${imgCount!==1?'s':''}`].filter(Boolean).join(' · ')}
        </p>

        {/* Duration section */}
        <p style={{ fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em',color:'var(--text-muted)',marginBottom:12 }}>Clip Duration</p>
        {!hasImages && (
          <label style={{ display:'flex',alignItems:'flex-start',gap:10,marginBottom:12,cursor:'pointer' }}>
            <input type="radio" checked={durMode==='full'} onChange={()=>setDurMode('full')} style={{ marginTop:3,accentColor:'#111' }} />
            <div>
              <span style={{ fontSize:13,fontWeight:500 }}>Full video</span>
              <p style={{ fontSize:11,color:'var(--text-muted)',marginTop:2 }}>Each video clip plays in its entirety</p>
            </div>
          </label>
        )}
        <label style={{ display:'flex',alignItems:'flex-start',gap:10,marginBottom:20,cursor: hasImages?'default':'pointer' }}>
          <input type="radio" checked={durMode==='custom'||hasImages} onChange={()=>setDurMode('custom')} disabled={hasImages} style={{ marginTop:7,accentColor:'#111' }} />
          <div>
            <div style={{ display:'flex',alignItems:'center',gap:8 }}>
              <span style={{ fontSize:13,fontWeight:500 }}>{hasImages?'Show each clip for':'Custom:'}</span>
              <input type="number" min="0.5" max="300" step="0.5" value={customDur}
                onChange={e=>{ setCustomDur(e.target.value); if(!hasImages) setDurMode('custom') }}
                style={{ width:60,padding:'4px 8px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text-primary)',fontSize:13,fontFamily:'inherit',outline:'none',textAlign:'center' }}
              />
              <span style={{ fontSize:13,color:'var(--text-muted)' }}>seconds</span>
            </div>
            <p style={{ fontSize:11,color:'var(--text-muted)',marginTop:4 }}>
              {hasImages
                ? <>Images need an explicit duration.{vidCount>0?' Videos will also be trimmed to this length.':''}</>
                : durMode==='custom' ? 'Drag a clip in the timeline to adjust where it starts.' : ''}
            </p>
          </div>
        </label>

        {/* Transition section */}
        <p style={{ fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em',color:'var(--text-muted)',marginBottom:12 }}>Default Transition</p>
        <div style={{ display:'flex',flexWrap:'wrap',gap:6,marginBottom:28 }}>
          {TRANSITIONS.map(t=>(
            <button key={t.id} onClick={()=>setDefaultTr(t.id)} style={{ padding:'5px 12px',borderRadius:7,border:`1.5px solid ${defaultTr===t.id?'#111':'var(--border)'}`,background:defaultTr===t.id?'#111':'var(--bg)',color:defaultTr===t.id?'#fff':'var(--text-secondary)',fontSize:12,fontWeight:defaultTr===t.id?600:400,cursor:'pointer',fontFamily:'inherit',transition:'all 0.1s',display:'flex',alignItems:'center',gap:5 }}>
              <TransIcon type={t.id}/> {t.label}
            </button>
          ))}
        </div>

        <div style={{ display:'flex',justifyContent:'flex-end',gap:8 }}>
          <button onClick={onCancel} style={{ padding:'8px 16px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'var(--text-secondary)',fontSize:13,cursor:'pointer',fontFamily:'inherit' }}>Cancel</button>
          <button onClick={confirm} style={{ padding:'8px 22px',borderRadius:8,border:'none',background:'#111',color:'#fff',fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'inherit' }}>Build Sequence →</button>
        </div>
      </div>
    </div>
  )
}

// ── Transition pill ──────────────────────────────────────────────
function TransitionPill({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(()=>{
    const h=e=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown',h); return ()=>document.removeEventListener('mousedown',h)
  },[])
  const isCut = !value.enabled || value.type==='cut'
  return (
    <div ref={ref} style={{ position:'relative',flexShrink:0,userSelect:'none' }}>
      <div style={{ display:'flex',alignItems:'center',gap:4 }}>
        <button onClick={()=>onChange({...value,enabled:!value.enabled})} title={value.enabled?'Disable':'Enable'}
          style={{ width:18,height:18,borderRadius:4,border:'none',background:value.enabled?'#111':'var(--border)',color:value.enabled?'#fff':'var(--text-muted)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,transition:'all 0.1s',flexShrink:0 }}>
          {value.enabled?'✓':'✕'}
        </button>
        <button onClick={()=>setOpen(v=>!v)}
          style={{ display:'flex',alignItems:'center',gap:5,padding:'4px 9px',borderRadius:6,border:'1px solid var(--border)',background:isCut?'var(--bg)':'var(--surface)',color:isCut?'var(--text-muted)':'var(--text-primary)',fontSize:10,fontWeight:500,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',transition:'all 0.1s' }}>
          <TransIcon type={value.type}/>
          {value.enabled?(TRANSITIONS.find(t=>t.id===value.type)?.label??'Cut'):'Cut'}
          {value.enabled&&value.type!=='cut'&&<span style={{ color:'var(--text-muted)',fontSize:9 }}>{value.dur.toFixed(1)}s</span>}
          <span style={{ color:'var(--text-muted)',fontSize:8 }}>▾</span>
        </button>
      </div>
      {open&&(
        <div style={{ position:'absolute',bottom:'calc(100% + 8px)',left:'50%',transform:'translateX(-50%)',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,boxShadow:'0 8px 28px rgba(0,0,0,0.14)',zIndex:100,minWidth:190,overflow:'hidden' }}>
          <div style={{ padding:'10px 12px 6px',fontSize:10,color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em' }}>Type</div>
          {TRANSITIONS.map(t=>(
            <button key={t.id}
              onClick={()=>{ onChange({...value,type:t.id,enabled:t.id!=='cut',dur:t.id==='cut'?0:(value.dur||t.dur)}); setOpen(false) }}
              style={{ display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',padding:'7px 12px',background:value.type===t.id&&value.enabled?'var(--surface-hover)':'none',border:'none',cursor:'pointer',fontSize:12,color:'var(--text-primary)',fontFamily:'inherit',textAlign:'left' }}
              onMouseEnter={e=>e.currentTarget.style.background='var(--surface-hover)'}
              onMouseLeave={e=>e.currentTarget.style.background=value.type===t.id&&value.enabled?'var(--surface-hover)':'none'}>
              <span style={{ display:'flex',alignItems:'center',gap:7 }}><TransIcon type={t.id}/> {t.label}</span>
              {t.dur>0&&<span style={{ fontSize:10,color:'var(--text-muted)' }}>{t.dur}s</span>}
            </button>
          ))}
          {value.enabled&&value.type!=='cut'&&(
            <div style={{ padding:'8px 12px 12px',borderTop:'1px solid var(--border)' }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:5 }}>
                <span style={{ fontSize:10,color:'var(--text-muted)',fontWeight:500 }}>Duration</span>
                <span style={{ fontSize:10,color:'var(--text-secondary)',fontVariantNumeric:'tabular-nums' }}>{value.dur.toFixed(1)}s</span>
              </div>
              <input type="range" min={0.2} max={3} step={0.1} value={value.dur}
                onChange={e=>onChange({...value,dur:parseFloat(e.target.value)})}
                style={{ width:'100%',accentColor:'#111',cursor:'pointer' }}/>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
function TransIcon({ type }) {
  const m = { cut:'✕',dissolve:'◈','fade-black':'◼','fade-white':'◻','slide-left':'→','slide-right':'←',wipe:'▷','zoom-in':'⊕' }
  return <span style={{ fontSize:10,opacity:0.7 }}>{m[type]??'◈'}</span>
}

// ── Clip card with scrub ─────────────────────────────────────────
function ClipCard({ clip, isActive, isDragging, onRemove, onDragStart, onScrub }) {
  const [scrubThumb,  setScrubThumb]  = useState(null)
  const [scrubOffset, setScrubOffset] = useState(null)
  const scrubVidRef   = useRef(null)
  const seekingRef    = useRef(false)
  const pendingRef    = useRef(null)
  const scrubActive   = useRef(false)
  const latestThumb   = useRef(null)

  useEffect(()=>()=>{
    if (scrubVidRef.current) { URL.revokeObjectURL(scrubVidRef.current.src); scrubVidRef.current.src='' }
  },[])

  const ensureScrubVid = useCallback(()=>{
    if (scrubVidRef.current || clip.type!=='video') return
    const vid = document.createElement('video')
    vid.src = URL.createObjectURL(clip.file)
    vid.muted=true; vid.preload='auto'
    vid.addEventListener('seeked',()=>{
      if (!scrubActive.current) { seekingRef.current=false; return }
      const c=document.createElement('canvas')
      const vw=vid.videoWidth||1280, vh=vid.videoHeight||720
      c.width=260; c.height=Math.round(260*vh/vw)
      c.getContext('2d').drawImage(vid,0,0,c.width,c.height)
      const url=c.toDataURL('image/jpeg',0.7)
      latestThumb.current=url; setScrubThumb(url)
      seekingRef.current=false
      if (pendingRef.current!==null){ const t=pendingRef.current; pendingRef.current=null; seekingRef.current=true; vid.currentTime=t }
    })
    scrubVidRef.current=vid
  },[clip.file,clip.type])

  const seekScrub = useCallback((t)=>{
    ensureScrubVid()
    if (!scrubVidRef.current) return
    if (seekingRef.current){ pendingRef.current=t }
    else { seekingRef.current=true; pendingRef.current=null; scrubVidRef.current.currentTime=t }
  },[ensureScrubVid])

  const canScrub = clip.type==='video' && clip.clipDuration>0 && clip.duration>0

  const handleThumbDown = useCallback((e)=>{
    if (!canScrub) return
    e.preventDefault(); e.stopPropagation()
    scrubActive.current=true; latestThumb.current=null
    const startX=e.clientX, startOff=clip.startOffset||0
    const sens=clip.duration/300
    let curOff=startOff

    const onMove=(mv)=>{
      const maxOff=Math.max(0,clip.duration-clip.clipDuration)
      curOff=Math.max(0,Math.min(startOff+(mv.clientX-startX)*sens,maxOff))
      setScrubOffset(curOff); seekScrub(curOff)
    }
    const onUp=()=>{
      window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp)
      scrubActive.current=false
      if (Math.abs(curOff-startOff)>0.05) onScrub?.(curOff, latestThumb.current||clip.thumb)
      setScrubThumb(null); setScrubOffset(null); latestThumb.current=null
    }
    window.addEventListener('mousemove',onMove); window.addEventListener('mouseup',onUp)
  },[canScrub,clip.startOffset,clip.duration,clip.clipDuration,clip.thumb,seekScrub,onScrub])

  const thumbSrc = scrubThumb||clip.thumb
  const fmtDur = s => s<60 ? `${s.toFixed(1)}s` : `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`

  return (
    <div style={{ flexShrink:0,width:130,borderRadius:9,overflow:'hidden',border:`1.5px solid ${isActive?'#111':'var(--border)'}`,background:'var(--surface)',boxShadow:isDragging?'0 8px 24px rgba(0,0,0,0.18)':'0 1px 4px rgba(0,0,0,0.06)',opacity:isDragging?0.5:1,transition:'border-color 0.15s,opacity 0.15s',userSelect:'none' }}>
      {/* Grip handle for reorder */}
      <div onMouseDown={onDragStart} title="Drag to reorder"
        style={{ display:'flex',alignItems:'center',justifyContent:'center',height:18,cursor:'grab',color:'var(--text-muted)',background:'var(--bg)',borderBottom:'1px solid var(--border)' }}>
        <GripIcon/>
      </div>
      {/* Thumbnail — drag horizontally to scrub */}
      <div onMouseDown={handleThumbDown}
        style={{ position:'relative',aspectRatio:'16/9',background:'#111',overflow:'hidden',cursor:canScrub?'ew-resize':'default' }}>
        {thumbSrc
          ? <img src={thumbSrc} style={{ width:'100%',height:'100%',objectFit:'cover',display:'block' }} alt=""/>
          : <div style={{ width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center' }}><MiniSpinner/></div>
        }
        {isActive&&<div style={{ position:'absolute',inset:0,border:'2px solid #111',borderRadius:7,pointerEvents:'none' }}/>}
        <button onClick={e=>{e.stopPropagation();onRemove()}}
          style={{ position:'absolute',top:4,right:4,width:18,height:18,borderRadius:4,background:'rgba(0,0,0,0.65)',border:'none',color:'#fff',fontSize:10,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>✕</button>
        {clip.type==='image'&&<div style={{ position:'absolute',top:4,left:4,background:'rgba(0,0,0,0.6)',color:'#fff',fontSize:8,padding:'2px 5px',borderRadius:3,fontWeight:600 }}>IMG</div>}
        {canScrub&&scrubOffset!==null&&(
          <div style={{ position:'absolute',bottom:4,left:'50%',transform:'translateX(-50%)',background:'rgba(0,0,0,0.75)',color:'#fff',fontSize:9,padding:'2px 6px',borderRadius:4,whiteSpace:'nowrap',pointerEvents:'none' }}>
            +{fmtDur(scrubOffset)}
          </div>
        )}
      </div>
      {/* Footer */}
      <div style={{ padding:'5px 8px' }}>
        <p style={{ fontSize:10,color:'var(--text-secondary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
          {clip.file.name.replace(/\.[^/.]+$/,'')}
        </p>
        <p style={{ fontSize:9,color:'var(--text-muted)' }}>
          {clip.duration>0
            ? clip.clipDuration>0 ? `${fmtDur(clip.clipDuration)} / ${fmtDur(clip.duration)}` : fmtDur(clip.duration)
            : clip.clipDuration>0 ? `${fmtDur(clip.clipDuration)}` : '…'}
        </p>
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────
export default function SceneArranger() {
  const [pageState, setPageState]     = useState('idle') // idle | configuring | ready
  const [pendingFiles, setPending]    = useState([])
  const [config, setConfig]           = useState({ durMode:'full', customDur:3, defaultTr:'dissolve' })
  const [clips, setClips]             = useState([])
  const [transitions, setTransitions] = useState([])
  const [dragging, setDragging]       = useState(false)
  const [activeClip, setActiveClip]   = useState(null)
  const [isPlaying, setIsPlaying]     = useState(false)
  const [exporting, setExporting]     = useState(false)
  const [dragIdx, setDragIdx]         = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)

  const canvasRef   = useRef(null)
  const mediaRefs   = useRef({})
  const playerRef   = useRef(null)
  const inputRef    = useRef(null)
  const addInputRef = useRef(null)
  const timelineRef = useRef(null)
  const dragOvRef   = useRef(null)

  useEffect(()=>{ playerRef.current=createPlayer(canvasRef,mediaRefs); return()=>playerRef.current?.stop() },[])

  // Sync media elements
  useEffect(()=>{
    clips.forEach(clip=>{
      if (mediaRefs.current[clip.id]) return
      if (clip.type==='video'){
        const vid=document.createElement('video')
        vid.src=URL.createObjectURL(clip.file); vid.muted=true; vid.preload='auto'
        mediaRefs.current[clip.id]={type:'video',el:vid}
      } else {
        const img=new Image()
        img.src=URL.createObjectURL(clip.file)
        mediaRefs.current[clip.id]={type:'image',el:img}
      }
    })
    const ids=new Set(clips.map(c=>c.id))
    Object.keys(mediaRefs.current).forEach(id=>{
      if (!ids.has(id)){ const {el}=mediaRefs.current[id]; URL.revokeObjectURL(el.src); el.src=''; delete mediaRefs.current[id] }
    })
  },[clips])

  // Load metadata + thumbnail for one clip
  const loadMeta = useCallback((clip, cfg) => {
    if (clip.type==='video'){
      const url=URL.createObjectURL(clip.file)
      const vid=document.createElement('video')
      vid.src=url; vid.muted=true; vid.preload='auto'
      vid.addEventListener('loadedmetadata',()=>{
        const dur=vid.duration, vw=vid.videoWidth||1280, vh=vid.videoHeight||720
        vid.currentTime=Math.min(dur*0.1,dur-0.001)
        vid.addEventListener('seeked',()=>{
          const c=document.createElement('canvas')
          const sc=Math.min(1,260/vw); c.width=Math.round(vw*sc); c.height=Math.round(vh*sc)
          c.getContext('2d').drawImage(vid,0,0,c.width,c.height)
          const thumb=c.toDataURL('image/jpeg',0.7)
          const clipDur=cfg.durMode==='custom'?Math.min(cfg.customDur,dur):0
          URL.revokeObjectURL(url); vid.src=''
          setClips(prev=>prev.map(cl=>cl.id===clip.id?{...cl,thumb,duration:dur,clipDuration:clipDur,nativeW:vw,nativeH:vh}:cl))
        },{once:true})
      },{once:true})
    } else {
      const burl=URL.createObjectURL(clip.file)
      const img=new Image()
      img.onload=()=>{
        const c=document.createElement('canvas')
        const sc=Math.min(1,260/img.naturalWidth); c.width=Math.round(img.naturalWidth*sc); c.height=Math.round(img.naturalHeight*sc)
        c.getContext('2d').drawImage(img,0,0,c.width,c.height)
        const thumb=c.toDataURL('image/jpeg',0.7)
        URL.revokeObjectURL(burl)
        setClips(prev=>prev.map(cl=>cl.id===clip.id?{...cl,thumb,duration:cfg.customDur,clipDuration:cfg.customDur,nativeW:img.naturalWidth,nativeH:img.naturalHeight}:cl))
      }
      img.src=burl
    }
  },[])

  const processFiles = useCallback((files, cfg) => {
    const newClips=files.map(f=>({
      id:`${f.name}_${Date.now()}_${Math.random()}`,
      file:f,
      type:f.type.startsWith('image/')?'image':'video',
      thumb:null, duration:0,
      clipDuration:f.type.startsWith('image/')?cfg.customDur:(cfg.durMode==='custom'?cfg.customDur:0),
      startOffset:0, nativeW:0, nativeH:0,
    }))
    setClips(prev=>{
      const updated=[...prev,...newClips]
      setTransitions(tr=>{ const n=[...tr]; while(n.length<updated.length-1) n.push(mkTr(cfg.defaultTr)); return n.slice(0,updated.length-1) })
      return updated
    })
    newClips.forEach(cl=>loadMeta(cl,cfg))
  },[loadMeta])

  const handleStartFiles = useCallback((files)=>{
    const valid=Array.from(files).filter(f=>f.type.startsWith('video/')||f.type.startsWith('image/'))
    if (!valid.length) return
    setPending(valid); setPageState('configuring')
  },[])

  const handleConfirmConfig = useCallback((cfg)=>{
    setConfig(cfg); setPageState('ready')
    processFiles(pendingFiles, cfg); setPending([])
  },[pendingFiles,processFiles])

  const handleAddMore = useCallback((files)=>{
    const valid=Array.from(files).filter(f=>f.type.startsWith('video/')||f.type.startsWith('image/'))
    if (!valid.length) return
    processFiles(valid, config)
  },[config,processFiles])

  const handleScrub = useCallback((id, newOffset, newThumb)=>{
    setClips(prev=>prev.map(cl=>cl.id===id?{...cl,startOffset:newOffset,...(newThumb?{thumb:newThumb}:{})}:cl))
  },[])

  const removeClip = useCallback((idx)=>{
    setClips(prev=>{ const n=[...prev]; n.splice(idx,1); return n })
    setTransitions(prev=>{ const n=[...prev]; if(n.length>0) n.splice(Math.min(idx,n.length-1),1); return n })
  },[])

  const handlePlay = async()=>{
    if (isPlaying){ playerRef.current?.stop(); setIsPlaying(false); setActiveClip(null); return }
    if (!clips.length) return
    setIsPlaying(true)
    await playerRef.current?.play(clips,transitions,setActiveClip)
    setIsPlaying(false); setActiveClip(null)
  }

  const handleExport = async()=>{
    if (!clips.length||exporting) return
    const canvas=canvasRef.current; if (!canvas) return
    setExporting(true); playerRef.current?.stop()
    const mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm'
    const rec=new MediaRecorder(canvas.captureStream(30),{mimeType:mime,videoBitsPerSecond:6_000_000})
    const chunks=[]; rec.ondataavailable=e=>{ if(e.data.size>0) chunks.push(e.data) }; rec.start(200)
    setIsPlaying(true)
    await playerRef.current?.play(clips,transitions,setActiveClip)
    setIsPlaying(false); setActiveClip(null)
    await new Promise(r=>{ rec.onstop=r; rec.stop() })
    const blob=new Blob(chunks,{type:mime})
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='sequence.webm'; a.click()
    setExporting(false)
  }

  // Drag-to-reorder
  const handleCardDragStart = (idx) => (e) => {
    e.preventDefault(); setDragIdx(idx); dragOvRef.current=idx
    const onMove=(mv)=>{
      const el=timelineRef.current; if(!el) return
      const cards=[...el.querySelectorAll('[data-clipidx]')]
      let over=idx
      for (const card of cards){ const r=card.getBoundingClientRect(); if(mv.clientX<r.right){over=+card.dataset.clipidx;break}; over=+card.dataset.clipidx+1 }
      over=Math.min(over,clips.length-1); dragOvRef.current=over; setDragOverIdx(over)
    }
    const onUp=()=>{
      window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp)
      const ov=dragOvRef.current
      setDragIdx(null); setDragOverIdx(null)
      if (ov!==null&&ov!==idx){
        setClips(prev=>{ const n=[...prev]; const [it]=n.splice(idx,1); n.splice(ov,0,it); return n })
        setTransitions(prev=>{ const n=[...prev]; while(n.length<clips.length-1) n.push(mkTr(config.defaultTr)); return n.slice(0,clips.length-1) })
      }
    }
    window.addEventListener('mousemove',onMove); window.addEventListener('mouseup',onUp)
  }

  // ── Drop zone ───────────────────────────────────────────────
  if (pageState==='idle'||pageState==='configuring') return (
    <div
      onDragOver={e=>{e.preventDefault();setDragging(true)}}
      onDragLeave={()=>setDragging(false)}
      onDrop={e=>{e.preventDefault();setDragging(false);handleStartFiles(e.dataTransfer.files)}}
      style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:36,padding:40 }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ display:'inline-flex',alignItems:'center',gap:9,marginBottom:8 }}>
          <FilmstripIcon size={20}/><span style={{ fontSize:18,fontWeight:600,letterSpacing:'-0.3px' }}>Scene Arranger</span>
        </div>
        <p style={{ color:'var(--text-muted)',fontSize:13 }}>Arrange clips & images · add transitions · preview & export WebM</p>
      </div>
      <div onClick={()=>inputRef.current?.click()} style={{ width:'100%',maxWidth:460,padding:'48px 40px',border:`2px dashed ${dragging?'var(--accent)':'var(--border)'}`,borderRadius:16,background:dragging?'rgba(17,17,17,0.02)':'var(--surface)',display:'flex',flexDirection:'column',alignItems:'center',gap:12,cursor:'pointer',transition:'all 0.15s',transform:dragging?'scale(1.01)':'scale(1)' }}>
        <div style={{ width:48,height:48,borderRadius:12,background:dragging?'var(--accent)':'#f0f0f0',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.15s' }}>
          <UploadIcon color={dragging?'#fff':'#888'}/>
        </div>
        <div style={{ textAlign:'center' }}>
          <p style={{ fontWeight:500,marginBottom:4 }}>{dragging?'Drop your clips!':'Drop videos or images'}</p>
          <p style={{ color:'var(--text-muted)',fontSize:12 }}>or <span style={{ color:'var(--text-primary)',textDecoration:'underline' }}>browse</span> to select files</p>
        </div>
        <p style={{ color:'var(--text-muted)',fontSize:11 }}>MP4, MOV, WebM, JPG, PNG, GIF · arrange in any order</p>
      </div>
      <input ref={inputRef} type="file" accept="video/*,image/*" multiple style={{ display:'none' }} onChange={e=>handleStartFiles(e.target.files)}/>
      <div style={{ display:'flex',gap:32,color:'var(--text-muted)',fontSize:12 }}>
        {[['01','Drop clips & images'],['02','Set duration & transitions'],['03','Preview & export']].map(([n,t])=>(
          <div key={n} style={{ display:'flex',alignItems:'center',gap:7 }}>
            <span style={{ fontSize:10,fontWeight:700,color:'var(--text-primary)',opacity:0.35 }}>{n}</span><span>{t}</span>
          </div>
        ))}
      </div>
      {pageState==='configuring'&&(
        <ConfigModal files={pendingFiles} onConfirm={handleConfirmConfig} onCancel={()=>{setPending([]);setPageState('idle')}}/>
      )}
    </div>
  )

  // ── Sequence view ───────────────────────────────────────────
  return (
    <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden' }}>
      {/* Toolbar */}
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 20px',borderBottom:'1px solid var(--border)',background:'var(--surface)',flexShrink:0,gap:14 }}>
        <div style={{ display:'flex',alignItems:'center',gap:12 }}>
          <IBtn onClick={()=>{ playerRef.current?.stop(); setClips([]); setTransitions([]); setPageState('idle') }} title="Back"><ArrowLeftIcon/></IBtn>
          <div style={{ width:1,height:16,background:'var(--border)' }}/>
          <div>
            <p style={{ fontWeight:500,fontSize:13 }}>Scene Arranger</p>
            <p style={{ fontSize:11,color:'var(--text-muted)' }}>{clips.length} clip{clips.length!==1?'s':''} · {transitions.filter(t=>t.enabled&&t.type!=='cut').length} transition{transitions.filter(t=>t.enabled&&t.type!=='cut').length!==1?'s':''}</p>
          </div>
        </div>
        <div style={{ display:'flex',gap:8,alignItems:'center' }}>
          <button onClick={()=>addInputRef.current?.click()} style={{ display:'flex',alignItems:'center',gap:6,padding:'7px 13px',borderRadius:7,background:'var(--surface-hover)',color:'var(--text-secondary)',border:'1px solid var(--border)',fontWeight:500,fontSize:12,cursor:'pointer',fontFamily:'inherit' }}>+ Add clips</button>
          <input ref={addInputRef} type="file" accept="video/*,image/*" multiple style={{ display:'none' }} onChange={e=>handleAddMore(e.target.files)}/>
          <button onClick={handlePlay} disabled={exporting} style={{ display:'flex',alignItems:'center',gap:7,padding:'7px 16px',borderRadius:7,background:isPlaying?'#ef4444':'var(--accent)',color:'#fff',border:'none',fontWeight:500,fontSize:13,cursor:'pointer',fontFamily:'inherit',transition:'background 0.1s' }}>
            {isPlaying?<StopIcon/>:<PlayIcon/>}{isPlaying?'Stop':'Preview'}
          </button>
          <button onClick={handleExport} disabled={isPlaying||exporting||!clips.length} style={{ display:'flex',alignItems:'center',gap:7,padding:'7px 15px',borderRadius:7,background:'var(--surface-hover)',color:'var(--text-secondary)',border:'1px solid var(--border)',fontWeight:500,fontSize:12,cursor:exporting?'wait':'pointer',fontFamily:'inherit',opacity:isPlaying?0.5:1 }}>
            <ExportIcon/>{exporting?'Encoding…':'Export WebM'}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex:1,background:'#0e0e0e',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',minHeight:0,position:'relative' }}>
        <canvas ref={canvasRef} width={1280} height={720} style={{ maxWidth:'100%',maxHeight:'100%',display:'block' }}/>
        {!isPlaying&&clips.length>0&&(
          <div style={{ position:'absolute',display:'flex',flexDirection:'column',alignItems:'center',gap:8 }}>
            <button onClick={handlePlay} style={{ width:56,height:56,borderRadius:'50%',background:'rgba(255,255,255,0.12)',border:'1.5px solid rgba(255,255,255,0.25)',backdropFilter:'blur(8px)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',transition:'transform 0.1s' }} onMouseEnter={e=>e.currentTarget.style.transform='scale(1.08)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
              <PlayIcon size={22}/>
            </button>
            <span style={{ color:'rgba(255,255,255,0.45)',fontSize:11 }}>Click to preview sequence</span>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div style={{ flexShrink:0,borderTop:'1px solid var(--border)',background:'var(--bg)',padding:'14px 20px',overflowX:'auto' }}>
        <div ref={timelineRef} style={{ display:'flex',alignItems:'center',gap:0,width:'max-content',minWidth:'100%' }}>
          {clips.map((clip,i)=>(
            <div key={clip.id} style={{ display:'flex',alignItems:'center' }}>
              <div data-clipidx={i}>
                <ClipCard
                  clip={clip} isActive={activeClip===i} isDragging={dragIdx===i}
                  onRemove={()=>removeClip(i)}
                  onDragStart={handleCardDragStart(i)}
                  onScrub={(off,thumb)=>handleScrub(clip.id,off,thumb)}
                />
              </div>
              {i<clips.length-1&&(
                <div style={{ display:'flex',alignItems:'center',justifyContent:'center',padding:'0 10px',flexShrink:0 }}>
                  <TransitionPill value={transitions[i]??mkTr('dissolve')} onChange={tr=>setTransitions(prev=>{ const n=[...prev]; while(n.length<=i) n.push(mkTr('dissolve')); n[i]=tr; return n })}/>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ArrowLeftIcon(){ return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> }
function PlayIcon({ size=13 }){ return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> }
function StopIcon(){ return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg> }
function ExportIcon(){ return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> }
function FilmstripIcon({ size=20 }){ return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="17" y1="7" x2="22" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/></svg> }
function UploadIcon({ color='#888' }){ return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg> }
function MiniSpinner(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2.5"><style>{`@keyframes sa{to{transform:rotate(360deg)}} .sa{animation:sa 0.9s linear infinite;transform-origin:12px 12px}`}</style><circle className="sa" cx="12" cy="12" r="9" strokeDasharray="36 18"/></svg> }
function GripIcon(){ return <svg width="12" height="8" viewBox="0 0 12 8" fill="currentColor"><rect y="0" width="12" height="1.5" rx="1"/><rect y="3.25" width="12" height="1.5" rx="1"/><rect y="6.5" width="12" height="1.5" rx="1"/></svg> }
function IBtn({ onClick, title, children }){ return <button onClick={onClick} title={title} style={{ width:30,height:30,borderRadius:7,background:'transparent',color:'var(--text-secondary)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'background 0.1s' }} onMouseEnter={e=>e.currentTarget.style.background='var(--surface-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>{children}</button> }
