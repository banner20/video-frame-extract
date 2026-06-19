import { useState, useRef } from 'react'

export default function FrameStrip({ frames, onRemove, onSeek, onPreview, onExtract, formatTime }) {
  return (
    <div style={{
      borderTop: '1px solid var(--border)',
      background: 'var(--surface)',
      flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px 6px',
        borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: '11px', fontWeight: '500', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Selected frames
        </span>
        <span style={{
          fontSize: '11px', color: 'var(--text-muted)',
          background: 'var(--surface-hover)',
          padding: '1px 7px', borderRadius: '100px',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {frames.length}
        </span>
      </div>

      {/* Horizontal scroll strip */}
      <div style={{
        display: 'flex',
        overflowX: 'auto',
        padding: '10px 14px',
        gap: '8px',
        scrollbarWidth: 'thin',
        scrollbarColor: '#ddd transparent',
      }}>
        {frames.map((frame, idx) => (
          <FrameThumb
            key={frame.id}
            frame={frame}
            index={idx + 1}
            onRemove={() => onRemove(frame.id)}
            onSeek={() => onSeek(frame.time)}
            onPreview={() => onPreview(frame)}
            onExtract={() => onExtract(frame)}
            formatTime={formatTime}
          />
        ))}
      </div>
    </div>
  )
}

function FrameThumb({ frame, index, onRemove, onSeek, onPreview, onExtract, formatTime }) {
  const [hovered, setHovered] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyToClipboard = async (e) => {
    e.stopPropagation()
    try {
      const res = await fetch(frame.dataUrl)
      const blob = await res.blob()
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ])
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // fallback: open in new tab
      window.open(frame.dataUrl, '_blank')
    }
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flexShrink: 0,
        width: '112px',
        borderRadius: '8px',
        overflow: 'hidden',
        border: `1.5px solid ${hovered ? '#b0b0b0' : 'var(--border)'}`,
        background: 'var(--surface)',
        boxShadow: hovered ? '0 3px 10px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.05)',
        transition: 'all 0.15s ease',
        transform: hovered ? 'translateY(-2px)' : 'none',
        cursor: 'pointer',
        position: 'relative',
      }}
      onClick={onPreview}
    >
      {/* Thumbnail */}
      <div style={{ position: 'relative', aspectRatio: '16/9' }}>
        <img
          src={frame.dataUrl}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          alt={`Frame ${index}`}
          draggable={false}
        />

        {/* Hover overlay with actions */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.52)',
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.12s',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '4px',
        }}>
          <MiniBtn onClick={(e) => { e.stopPropagation(); onSeek() }} title="Jump here">
            <SeekIcon />
          </MiniBtn>
          <MiniBtn onClick={(e) => { e.stopPropagation(); onExtract() }} title="Extract subject">
            <ScissorsIcon />
          </MiniBtn>
          <MiniBtn onClick={copyToClipboard} title="Copy to clipboard" success={copied}>
            {copied ? <CheckIcon /> : <CopyIcon />}
          </MiniBtn>
          <MiniBtn onClick={(e) => { e.stopPropagation(); onRemove() }} title="Remove" danger>
            <TrashIcon />
          </MiniBtn>
        </div>

        {/* Frame number */}
        <div style={{
          position: 'absolute', top: '4px', left: '4px',
          background: 'rgba(0,0,0,0.5)',
          color: '#fff', fontSize: '9px', fontWeight: '700',
          padding: '1px 5px', borderRadius: '3px',
          backdropFilter: 'blur(3px)',
          opacity: hovered ? 0 : 1,
          transition: 'opacity 0.12s',
          letterSpacing: '0.03em',
        }}>
          #{index}
        </div>

        {/* Expand hint */}
        <div style={{
          position: 'absolute', top: '4px', right: '4px',
          opacity: hovered ? 0.9 : 0,
          transition: 'opacity 0.12s',
        }}>
          <ExpandIcon />
        </div>
      </div>

      {/* Time label */}
      <div style={{
        padding: '4px 6px',
        fontSize: '10px',
        color: 'var(--text-muted)',
        fontVariantNumeric: 'tabular-nums',
        fontWeight: '500',
        background: 'var(--surface)',
        textAlign: 'center',
      }}>
        {formatTime(frame.time)}
      </div>
    </div>
  )
}

function MiniBtn({ onClick, title, danger, success, children }) {
  const [h, setH] = useState(false)
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: '26px', height: '26px', borderRadius: '6px',
        border: 'none', cursor: 'pointer',
        background: h
          ? danger ? '#ef4444' : success ? '#16a34a' : 'rgba(255,255,255,0.95)'
          : 'rgba(255,255,255,0.8)',
        color: (h && (danger || success)) ? '#fff' : '#111',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.1s',
        backdropFilter: 'blur(4px)',
      }}
    >
      {children}
    </button>
  )
}

function ScissorsIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
}
function SeekIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
}
function CopyIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
}
function TrashIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
}
function CheckIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
}
function ExpandIcon() {
  return (
    <div style={{ background: 'rgba(0,0,0,0.5)', borderRadius: '4px', padding: '2px', display: 'flex' }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
        <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
      </svg>
    </div>
  )
}
