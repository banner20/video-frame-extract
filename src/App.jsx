import { useState, useCallback } from 'react'
import Dropzone from './components/Dropzone'
import FrameStudio from './components/FrameStudio'
import BatchStudio from './components/BatchStudio'

export default function App() {
  const [page, setPage] = useState('single') // 'single' | 'batch'
  const [video, setVideo] = useState(null)

  const handleVideoLoad = useCallback((file) => {
    const url = URL.createObjectURL(file)
    setVideo({ file, url, name: file.name })
  }, [])

  const handleReset = useCallback(() => {
    if (video?.url) URL.revokeObjectURL(video.url)
    setVideo(null)
  }, [video])

  const switchPage = (p) => {
    if (video) handleReset()
    setPage(p)
  }

  // Nav is hidden when FrameStudio is open (it has its own full-screen topbar)
  const showNav = !(page === 'single' && video !== null)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {showNav && (
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '0 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          height: '42px', flexShrink: 0, gap: '2px',
        }}>
          <NavTab active={page === 'single'} onClick={() => switchPage('single')}>
            <FilmTabIcon /> Frame Extract
          </NavTab>
          <NavTab active={page === 'batch'} onClick={() => switchPage('batch')}>
            <GridTabIcon /> Batch Thumbnails
          </NavTab>
        </div>
      )}

      {page === 'single' ? (
        !video ? (
          <Dropzone onVideoLoad={handleVideoLoad} />
        ) : (
          <FrameStudio video={video} onReset={handleReset} />
        )
      ) : (
        <BatchStudio />
      )}
    </div>
  )
}

function NavTab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '5px 12px', borderRadius: '7px',
        border: 'none',
        background: active ? 'var(--surface-hover)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        fontWeight: active ? '500' : '400',
        fontSize: '13px', cursor: 'pointer',
        transition: 'all 0.12s', fontFamily: 'inherit',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text-secondary)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text-muted)' }}
    >
      {children}
    </button>
  )
}

function FilmTabIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
}
function GridTabIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
}
