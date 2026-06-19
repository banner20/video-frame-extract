import { useState, useEffect } from 'react'

export default function FrameModal({ frame, formatTime, onClose, onRemove, onExtract }) {
  const [copied, setCopied] = useState(false)

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const copyToClipboard = async () => {
    try {
      const res = await fetch(frame.dataUrl)
      const blob = await res.blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.open(frame.dataUrl, '_blank')
    }
  }

  const downloadSingle = () => {
    const a = document.createElement('a')
    a.href = frame.dataUrl
    a.download = `frame_${formatTime(frame.time).replace(/[:.]/g, '-')}.png`
    a.click()
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(6px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        zIndex: 200, padding: '32px',
        gap: '16px',
      }}
    >
      {/* Image */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '90vw', maxHeight: '75vh',
          borderRadius: '12px', overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.1)',
          flexShrink: 1,
          display: 'flex',
        }}
      >
        <img
          src={frame.dataUrl}
          style={{ maxWidth: '100%', maxHeight: '75vh', display: 'block', objectFit: 'contain' }}
          alt="Frame preview"
          draggable={false}
        />
      </div>

      {/* Controls bar */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(12px)',
          borderRadius: '12px',
          padding: '10px 16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        }}
      >
        <span style={{
          fontSize: '12px', fontWeight: '600',
          color: '#111',
          fontVariantNumeric: 'tabular-nums',
          marginRight: '4px',
        }}>
          {formatTime(frame.time)}
        </span>

        <div style={{ width: '1px', height: '16px', background: '#ddd' }} />

        <ActionBtn onClick={copyToClipboard} label={copied ? 'Copied!' : 'Copy'} success={copied}>
          {copied ? <CheckIcon /> : <CopyIcon />}
        </ActionBtn>

        <ActionBtn onClick={downloadSingle} label="Download">
          <DownloadIcon />
        </ActionBtn>

        <ActionBtn onClick={onExtract} label="Extract subject" accent>
          <ScissorsIcon />
        </ActionBtn>

        <div style={{ width: '1px', height: '16px', background: '#ddd' }} />

        <ActionBtn onClick={onRemove} label="Remove" danger>
          <TrashIcon />
        </ActionBtn>

        <div style={{ width: '1px', height: '16px', background: '#ddd' }} />

        <ActionBtn onClick={onClose} label="Close">
          <CloseIcon />
        </ActionBtn>
      </div>

      <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
        Click outside or press Esc to close
      </p>
    </div>
  )
}

function ActionBtn({ onClick, label, danger, success, accent, children }) {
  const [h, setH] = useState(false)
  return (
    <button
      onClick={onClick}
      title={label}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '5px',
        padding: '6px 11px', borderRadius: '7px',
        border: accent ? '1.5px solid #7c3aed' : 'none',
        cursor: 'pointer',
        background: accent
          ? (h ? '#7c3aed' : 'transparent')
          : h
            ? danger ? '#ef4444' : success ? '#16a34a' : '#f0f0f0'
            : 'transparent',
        color: (accent && h) || (h && (danger || success)) ? '#fff' : accent ? '#7c3aed' : '#111',
        fontSize: '12px', fontWeight: '500',
        fontFamily: 'inherit',
        transition: 'all 0.1s',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
      {label}
    </button>
  )
}

function ScissorsIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
}
function CopyIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
}
function DownloadIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
}
function TrashIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
}
function CheckIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
}
function CloseIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
}
