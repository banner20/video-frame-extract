import { useState, useRef, useEffect, useCallback } from 'react'

const CHECKER = 14
const MAX_UNDO = 12

// ── helpers ──────────────────────────────────────────────────────────────────

function buildCheckerboard(w, h) {
  const cv = new OffscreenCanvas(w, h)
  const cx = cv.getContext('2d')
  for (let y = 0; y < h; y += CHECKER) {
    for (let x = 0; x < w; x += CHECKER) {
      cx.fillStyle = (Math.floor(x / CHECKER) + Math.floor(y / CHECKER)) % 2 === 0
        ? '#d8d8d8' : '#f0f0f0'
      cx.fillRect(x, y, CHECKER, CHECKER)
    }
  }
  return cv
}

function floodFill(origPixels, mask, w, h, sx, sy, tolerance, value) {
  const idx = (x, y) => y * w + x
  const pix = (x, y) => {
    const i = (y * w + x) * 4
    return [origPixels[i], origPixels[i + 1], origPixels[i + 2]]
  }
  const dist = (a, b) => Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2)

  const target = pix(sx, sy)
  const visited = new Uint8Array(w * h)
  const stack = [sx + sy * w]

  while (stack.length) {
    const pos = stack.pop()
    const x = pos % w, y = Math.floor(pos / w)
    if (x < 0 || x >= w || y < 0 || y >= h) continue
    if (visited[idx(x, y)]) continue
    visited[idx(x, y)] = 1
    if (dist(pix(x, y), target) > tolerance) continue
    mask[idx(x, y)] = value
    stack.push(pos + 1, pos - 1, pos + w, pos - w)
  }
}

function paintBrush(mask, w, h, cx, cy, radius, value) {
  const r2 = radius * radius
  const x0 = Math.max(0, Math.floor(cx - radius))
  const x1 = Math.min(w - 1, Math.ceil(cx + radius))
  const y0 = Math.max(0, Math.floor(cy - radius))
  const y1 = Math.min(h - 1, Math.ceil(cy + radius))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) {
        mask[y * w + x] = value
      }
    }
  }
}

function interpolateBrush(mask, w, h, x1, y1, x2, y2, radius, value) {
  const dist = Math.hypot(x2 - x1, y2 - y1)
  const steps = Math.max(1, Math.ceil(dist / (radius * 0.4)))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    paintBrush(mask, w, h, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, radius, value)
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ExtractStudio({ frame, formatTime, onClose }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)

  // internal state stored in refs to avoid re-render overhead
  const origPixelsRef = useRef(null)  // Uint8ClampedArray — original RGBA
  const maskRef = useRef(null)        // Uint8Array — 0=transparent, 255=opaque
  const outputRef = useRef(null)      // Uint8ClampedArray — reused output buffer
  const outputImgDataRef = useRef(null)
  const checkerRef = useRef(null)
  const offscreenRef = useRef(null)
  const undoStackRef = useRef([])
  const dimsRef = useRef({ w: 0, h: 0 })
  const rafRef = useRef(null)
  const needsRenderRef = useRef(false)
  const isDrawingRef = useRef(false)
  const lastPosRef = useRef(null)

  const [loaded, setLoaded] = useState(false)
  const [tool, setTool] = useState('erase')   // 'wand' | 'erase' | 'restore'
  const [brushSize, setBrushSize] = useState(28)
  const [tolerance, setTolerance] = useState(40)
  const [canUndo, setCanUndo] = useState(false)
  const [aiState, setAiState] = useState('idle') // idle | loading | running | error
  const [aiLabel, setAiLabel] = useState('')
  const [aiProgress, setAiProgress] = useState(0)
  const [exported, setExported] = useState(false)

  // ── init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      dimsRef.current = { w, h }

      // Extract original pixels
      const oc = new OffscreenCanvas(w, h)
      const ctx = oc.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const id = ctx.getImageData(0, 0, w, h)
      origPixelsRef.current = new Uint8ClampedArray(id.data)

      // Init mask (all opaque)
      maskRef.current = new Uint8Array(w * h).fill(255)

      // Pre-alloc output buffer (shares memory with ImageData)
      outputRef.current = new Uint8ClampedArray(origPixelsRef.current) // copy RGB, alpha overwritten each render
      outputImgDataRef.current = new ImageData(outputRef.current, w, h)

      // Pre-render checkerboard
      checkerRef.current = buildCheckerboard(w, h)
      offscreenRef.current = new OffscreenCanvas(w, h)

      setLoaded(true)
    }
    img.src = frame.dataUrl
  }, [frame.dataUrl])

  // ── render loop ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!loaded) return
    const canvas = canvasRef.current
    const { w, h } = dimsRef.current
    canvas.width = w
    canvas.height = h
    needsRenderRef.current = true

    const tick = () => {
      if (needsRenderRef.current) {
        renderFrame()
        needsRenderRef.current = false
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [loaded])

  const renderFrame = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { w, h } = dimsRef.current
    const mask = maskRef.current
    const orig = origPixelsRef.current
    const output = outputRef.current

    // Apply mask alpha to output buffer (RGB already copied from orig on init)
    for (let i = 0; i < w * h; i++) {
      output[i * 4 + 3] = mask[i]
    }

    // Draw checkerboard
    ctx.drawImage(checkerRef.current, 0, 0)

    // Composite masked image on top (transparent pixels show checker)
    const offCtx = offscreenRef.current.getContext('2d')
    offCtx.putImageData(outputImgDataRef.current, 0, 0)
    ctx.drawImage(offscreenRef.current, 0, 0)
  }

  // ── canvas coords ─────────────────────────────────────────────────────────

  const toCanvasCoords = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const { w, h } = dimsRef.current
    return {
      x: ((e.clientX - rect.left) / rect.width) * w,
      y: ((e.clientY - rect.top) / rect.height) * h,
    }
  }

  const scaledBrushRadius = () => {
    const canvas = canvasRef.current
    if (!canvas) return brushSize
    const rect = canvas.getBoundingClientRect()
    const { w } = dimsRef.current
    return brushSize * (w / rect.width)
  }

  // ── undo ──────────────────────────────────────────────────────────────────

  const saveUndo = useCallback(() => {
    const snap = new Uint8Array(maskRef.current)
    undoStackRef.current.push(snap)
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift()
    setCanUndo(true)
  }, [])

  const handleUndo = () => {
    const stack = undoStackRef.current
    if (!stack.length) return
    maskRef.current = stack.pop()
    needsRenderRef.current = true
    setCanUndo(stack.length > 0)
  }

  const handleReset = () => {
    saveUndo()
    const { w, h } = dimsRef.current
    maskRef.current = new Uint8Array(w * h).fill(255)
    needsRenderRef.current = true
  }

  // ── brush events ──────────────────────────────────────────────────────────

  const handleMouseDown = (e) => {
    if (e.button !== 0) return
    const pos = toCanvasCoords(e)

    if (tool === 'wand') {
      saveUndo()
      const { w, h } = dimsRef.current
      const x = Math.round(Math.max(0, Math.min(pos.x, w - 1)))
      const y = Math.round(Math.max(0, Math.min(pos.y, h - 1)))
      floodFill(origPixelsRef.current, maskRef.current, w, h, x, y, tolerance, 0)
      needsRenderRef.current = true
      return
    }

    isDrawingRef.current = true
    lastPosRef.current = pos
    saveUndo()
    const value = tool === 'erase' ? 0 : 255
    const radius = scaledBrushRadius()
    paintBrush(maskRef.current, dimsRef.current.w, dimsRef.current.h, pos.x, pos.y, radius, value)
    needsRenderRef.current = true
  }

  const handleMouseMove = useCallback((e) => {
    if (!isDrawingRef.current || tool === 'wand') return
    const pos = toCanvasCoords(e)
    const last = lastPosRef.current
    const value = tool === 'erase' ? 0 : 255
    const radius = scaledBrushRadius()
    interpolateBrush(maskRef.current, dimsRef.current.w, dimsRef.current.h,
      last.x, last.y, pos.x, pos.y, radius, value)
    lastPosRef.current = pos
    needsRenderRef.current = true
  }, [tool, brushSize])

  const handleMouseUp = () => { isDrawingRef.current = false }

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [])

  // ── AI remove background ──────────────────────────────────────────────────

  const handleAiRemove = async () => {
    setAiState('loading')
    setAiLabel('Loading model…')
    setAiProgress(0)
    try {
      // Dynamically load from esm.sh CDN — cached by browser after first load
      const { removeBackground } = await import(
        /* @vite-ignore */
        'https://esm.sh/@imgly/background-removal@1.7.0'
      )

      setAiState('running')

      const res = await fetch(frame.dataUrl)
      const blob = await res.blob()

      const resultBlob = await removeBackground(blob, {
        // Tell the lib where to find its WASM + model files
        publicPath: 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/dist/',
        progress: (key, current, total) => {
          const label = key.includes('/') ? key.split('/').pop() : key
          const pct = total > 0 ? Math.round((current / total) * 100) : 0
          setAiLabel(label.replace(/_/g, ' '))
          setAiProgress(pct)
        },
      })

      // Extract alpha channel from result PNG
      const url = URL.createObjectURL(resultBlob)
      const img = new Image()
      img.onload = () => {
        const { w, h } = dimsRef.current
        const oc = new OffscreenCanvas(w, h)
        const ctx = oc.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        const id = ctx.getImageData(0, 0, w, h)
        saveUndo()
        for (let i = 0; i < w * h; i++) {
          maskRef.current[i] = id.data[i * 4 + 3]
        }
        needsRenderRef.current = true
        URL.revokeObjectURL(url)
        setAiState('idle')
      }
      img.src = url
    } catch (err) {
      console.error('AI remove failed:', err)
      setAiState('error')
      setTimeout(() => setAiState('idle'), 3000)
    }
  }

  // ── export ────────────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    const { w, h } = dimsRef.current
    const orig = origPixelsRef.current
    const mask = maskRef.current

    // Build transparent PNG
    const oc = new OffscreenCanvas(w, h)
    const ctx = oc.getContext('2d')
    const id = ctx.createImageData(w, h)
    for (let i = 0; i < w * h; i++) {
      id.data[i * 4] = orig[i * 4]
      id.data[i * 4 + 1] = orig[i * 4 + 1]
      id.data[i * 4 + 2] = orig[i * 4 + 2]
      id.data[i * 4 + 3] = mask[i]
    }
    ctx.putImageData(id, 0, 0)

    // Tight crop — bounding box of non-transparent pixels
    let minX = w, maxX = 0, minY = h, maxY = 0
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (mask[y * w + x] > 0) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    const cw = maxX - minX + 1, ch = maxY - minY + 1
    const cropOc = new OffscreenCanvas(cw, ch)
    cropOc.getContext('2d').drawImage(oc, -minX, -minY)

    const blob = await cropOc.convertToBlob({ type: 'image/png' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `extract_${formatTime(frame.time).replace(/[:.]/g, '-')}.png`
    a.click()
    URL.revokeObjectURL(url)
    setExported(true)
    setTimeout(() => setExported(false), 2000)
  }, [frame, formatTime])

  // ── cursor ────────────────────────────────────────────────────────────────

  const getCursor = () => {
    if (tool === 'wand') return 'crosshair'
    const r = brushSize / 2
    const d = brushSize + 2
    const color = tool === 'erase' ? '%23ff4444' : '%2322c55e'
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${d}' height='${d}'><circle cx='${r+1}' cy='${r+1}' r='${r}' fill='none' stroke='${color}' stroke-width='1.5' opacity='0.9'/></svg>`
    return `url("data:image/svg+xml,${svg}") ${r + 1} ${r + 1}, crosshair`
  }

  // ── keyboard ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT') return
      if (e.key === 'Escape') onClose()
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) handleUndo()
      if (e.key === 'e') setTool('erase')
      if (e.key === 'r') setTool('restore')
      if (e.key === 'w') setTool('wand')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // ── render ────────────────────────────────────────────────────────────────

  const aiRunning = aiState === 'loading' || aiState === 'running'
  const TOOLS = [
    { id: 'wand', label: 'Magic Wand', key: 'W', icon: <WandIcon /> },
    { id: 'erase', label: 'Erase', key: 'E', icon: <EraseIcon /> },
    { id: 'restore', label: 'Restore', key: 'R', icon: <RestoreIcon /> },
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#1a1a1a',
      display: 'flex', flexDirection: 'column',
      zIndex: 300, fontFamily: 'inherit',
    }}>
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        height: '54px',
        background: '#222',
        borderBottom: '1px solid #333',
        display: 'flex', alignItems: 'center',
        padding: '0 16px',
        gap: '10px',
      }}>
        {/* Back */}
        <button onClick={onClose}
          style={barBtn()}
          onMouseEnter={e => e.currentTarget.style.background = '#333'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <ArrowLeftIcon color="#ccc" />
        </button>
        <div style={{ width: '1px', height: '18px', background: '#3a3a3a' }} />

        {/* Frame info */}
        <span style={{ fontSize: '12px', color: '#888', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {formatTime(frame.time)}
        </span>
        <div style={{ width: '1px', height: '18px', background: '#3a3a3a' }} />

        {/* Tool buttons */}
        <div style={{ display: 'flex', gap: '3px' }}>
          {TOOLS.map(t => (
            <button key={t.id} onClick={() => setTool(t.id)}
              title={`${t.label} (${t.key})`}
              style={{
                ...barBtn(),
                background: tool === t.id ? '#444' : 'transparent',
                color: tool === t.id ? '#fff' : '#999',
                gap: '5px', padding: '6px 11px', fontSize: '12px',
                border: tool === t.id ? '1px solid #555' : '1px solid transparent',
              }}
              onMouseEnter={e => { if (tool !== t.id) e.currentTarget.style.background = '#2e2e2e' }}
              onMouseLeave={e => { if (tool !== t.id) e.currentTarget.style.background = 'transparent' }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Brush/tolerance controls */}
        {tool !== 'wand' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{ fontSize: '11px', color: '#666' }}>Size</span>
            <input type="range" min={4} max={120} value={brushSize}
              onChange={e => setBrushSize(Number(e.target.value))}
              style={{ width: '80px', accentColor: '#fff' }}
            />
            <span style={{ fontSize: '11px', color: '#888', fontVariantNumeric: 'tabular-nums', minWidth: '28px' }}>
              {brushSize}
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{ fontSize: '11px', color: '#666' }}>Tolerance</span>
            <input type="range" min={0} max={150} value={tolerance}
              onChange={e => setTolerance(Number(e.target.value))}
              style={{ width: '80px', accentColor: '#fff' }}
            />
            <span style={{ fontSize: '11px', color: '#888', fontVariantNumeric: 'tabular-nums', minWidth: '28px' }}>
              {tolerance}
            </span>
          </div>
        )}

        <div style={{ width: '1px', height: '18px', background: '#3a3a3a' }} />

        {/* Undo / Reset */}
        <button onClick={handleUndo} disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          style={{ ...barBtn(), opacity: canUndo ? 1 : 0.35, color: '#aaa' }}
          onMouseEnter={e => { if (canUndo) e.currentTarget.style.background = '#2e2e2e' }}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <UndoIcon />
        </button>
        <button onClick={handleReset} title="Reset mask"
          style={{ ...barBtn(), color: '#aaa', fontSize: '12px' }}
          onMouseEnter={e => e.currentTarget.style.background = '#2e2e2e'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          Reset
        </button>

        <div style={{ width: '1px', height: '18px', background: '#3a3a3a' }} />

        {/* AI Remove BG */}
        <button
          onClick={handleAiRemove}
          disabled={aiRunning || !loaded}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 13px', borderRadius: '7px',
            border: 'none', cursor: aiRunning ? 'default' : 'pointer',
            background: aiState === 'error' ? '#7f1d1d' : aiRunning ? '#2a2a2a' : '#7c3aed',
            color: aiState === 'error' ? '#fca5a5' : '#fff',
            fontSize: '12px', fontWeight: '500', fontFamily: 'inherit',
            opacity: !loaded ? 0.4 : 1,
            transition: 'background 0.15s',
            whiteSpace: 'nowrap',
          }}
        >
          {aiRunning ? (
            <>
              <Spinner />
              <span>
                {aiState === 'loading' ? 'Loading AI…' : aiLabel || 'Processing…'}
                {aiProgress > 0 && ` ${aiProgress}%`}
              </span>
            </>
          ) : aiState === 'error' ? (
            <><ErrorIcon /> Failed — retry</>
          ) : (
            <><SparkleIcon /> AI Remove BG</>
          )}
        </button>

        <div style={{ flex: 1 }} />

        {/* Export */}
        <button onClick={handleExport} disabled={!loaded}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '7px 16px', borderRadius: '7px',
            border: 'none', cursor: 'pointer',
            background: exported ? '#16a34a' : '#fff',
            color: exported ? '#fff' : '#111',
            fontSize: '13px', fontWeight: '600', fontFamily: 'inherit',
            opacity: !loaded ? 0.4 : 1,
            transition: 'background 0.2s',
            whiteSpace: 'nowrap',
          }}
        >
          {exported ? <><CheckIcon color="#fff" /> Saved!</> : <><DownloadIcon color="#111" /> Export PNG</>}
        </button>
      </div>

      {/* ── Canvas area ─────────────────────────────────────────── */}
      <div
        ref={containerRef}
        style={{
          flex: 1, overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px',
        }}
      >
        {!loaded ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#555' }}>
            <Spinner />
            <span style={{ fontSize: '14px' }}>Loading frame…</span>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              display: 'block',
              cursor: getCursor(),
              boxShadow: '0 8px 48px rgba(0,0,0,0.6)',
              borderRadius: '4px',
              touchAction: 'none',
            }}
          />
        )}

        {/* AI progress overlay */}
        {aiRunning && (
          <div style={{
            position: 'absolute',
            bottom: '32px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(20,20,20,0.92)',
            backdropFilter: 'blur(10px)',
            borderRadius: '12px',
            padding: '14px 22px',
            display: 'flex', flexDirection: 'column', gap: '8px',
            minWidth: '260px',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <span style={{ fontSize: '12px', color: '#ccc', flex: 1 }}>
                {aiState === 'loading' ? 'Downloading AI model…' : aiLabel || 'Removing background…'}
              </span>
              <span style={{ fontSize: '12px', color: '#888', fontVariantNumeric: 'tabular-nums' }}>{aiProgress}%</span>
            </div>
            <div style={{ height: '4px', background: '#333', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${aiProgress}%`,
                background: '#7c3aed',
                borderRadius: '2px',
                transition: 'width 0.3s ease',
              }} />
            </div>
            <p style={{ fontSize: '11px', color: '#555', margin: 0 }}>
              {aiState === 'loading' ? 'Model is cached after first load (~30MB)' : 'Running segmentation…'}
            </p>
          </div>
        )}
      </div>

      {/* ── Bottom hint bar ─────────────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        height: '32px',
        background: '#1a1a1a',
        borderTop: '1px solid #2a2a2a',
        display: 'flex', alignItems: 'center',
        padding: '0 16px',
        gap: '16px',
      }}>
        {[
          ['W', 'Magic wand'],
          ['E', 'Erase brush'],
          ['R', 'Restore brush'],
          ['Ctrl+Z', 'Undo'],
          ['Esc', 'Close'],
        ].map(([key, label]) => (
          <span key={key} style={{ fontSize: '11px', color: '#555', display: 'flex', gap: '5px', alignItems: 'center' }}>
            <kbd style={{
              padding: '1px 5px', borderRadius: '3px',
              background: '#2a2a2a', border: '1px solid #3a3a3a',
              color: '#888', fontSize: '10px', fontFamily: 'inherit',
            }}>{key}</kbd>
            {label}
          </span>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: '#444' }}>
          Export saves a cropped transparent PNG of just the subject
        </span>
      </div>
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────
function barBtn() {
  return {
    display: 'flex', alignItems: 'center', gap: '5px',
    padding: '6px 8px', borderRadius: '7px',
    border: 'none', cursor: 'pointer',
    background: 'transparent', color: '#aaa',
    fontSize: '12px', fontFamily: 'inherit',
    transition: 'background 0.1s',
    flexShrink: 0,
  }
}

// ── icons ─────────────────────────────────────────────────────────────────────
function ArrowLeftIcon({ color = 'currentColor' }) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
}
function WandIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h0"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg>
}
function EraseIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
}
function RestoreIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10"/><polyline points="12 6 12 12 16 14"/><path d="M22 22v-6h-6"/><path d="m16 22 6-6"/></svg>
}
function UndoIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 2.83-6.36L3 9"/></svg>
}
function SparkleIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
}
function DownloadIcon({ color = 'currentColor' }) {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
}
function CheckIcon({ color = 'currentColor' }) {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
}
function ErrorIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
}
function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <style>{`.xs{animation:xspin 0.7s linear infinite;transform-origin:center}@keyframes xspin{to{transform:rotate(360deg)}}`}</style>
      <circle className="xs" cx="12" cy="12" r="10" strokeDasharray="50 20"/>
    </svg>
  )
}
