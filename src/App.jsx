import { useState, useRef, useCallback, useEffect, Suspense } from 'react'
import Viewport3D from './Viewport3D'
import WorkoutPanel from './WorkoutPanel'
import { EXERCISES } from './exercises'
import { Button } from './components/ui/button'
import { Slider } from './components/ui/slider'
import { cn } from './lib/utils'

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [breakpoint])
  return isMobile
}

export default function App() {
  const viewportRef = useRef(null)
  const isMobile = useIsMobile()
  const [paintMode, setPaintMode] = useState('add')
  const [brushSize, setBrushSize] = useState(30)
  const [paintedMuscles, setPaintedMuscles] = useState(new Set())
  const [showWorkout, setShowWorkout] = useState(false)

  // Called after each paint stroke — re-detect which muscles are painted
  const handlePaintStroke = useCallback(() => {
    if (!viewportRef.current) return
    const detected = viewportRef.current.detectMuscles()
    setPaintedMuscles(detected)
  }, [])

  const handleClear = useCallback(() => {
    viewportRef.current?.clearPaint()
    setPaintedMuscles(new Set())
  }, [])

  return (
    <div style={styles.root}>
      {/* Ambient glow */}
      <div style={styles.glow} />

      {/* Header */}
      <header style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={styles.logo}>🎨</div>
          <div>
            <h1 style={{ ...styles.logoTitle, fontSize: isMobile ? 13 : 15 }}>Muscle Picasso</h1>
            {!isMobile && <p style={styles.logoSub}>3D anatomical model</p>}
          </div>
        </div>
        {paintedMuscles.size > 0 && (
          <Button
            size="sm"
            variant={showWorkout ? 'outline' : 'default'}
            onClick={() => setShowWorkout(!showWorkout)}
          >
            {showWorkout ? '← Back' : `View Workout (${paintedMuscles.size})`}
          </Button>
        )}
      </header>

      {/* Main area */}
      <div style={styles.main}>
        {/* 3D Viewport — always mounted to avoid losing Three.js state */}
        <div style={{ flex: 1, position: 'relative', display: showWorkout ? 'none' : 'flex' }}>
          <Suspense fallback={<LoadingOverlay />}>
            <Viewport3D
              ref={viewportRef}
              brushSize={brushSize}
              paintMode={paintMode}
              modelColor="#dca882"
              onPaintStroke={handlePaintStroke}
            />
          </Suspense>

          {/* Control hints — desktop only */}
          {!isMobile && (
            <div style={styles.hints}>
              <span>🖌️ Left click: Paint</span>
              <span>🔄 Right click / Ctrl+drag: Orbit</span>
              <span>🔍 Scroll: Zoom</span>
            </div>
          )}
        </div>

        {/* Sidebar — desktop only, hidden when showing workout */}
        {!isMobile && (
          <div style={{ ...styles.sidebar, display: showWorkout ? 'none' : 'flex' }}>
            {/* Brush Mode */}
            <Section label="Brush Mode">
              <div style={{ display: 'flex', gap: 4 }}>
                {[
                  { key: 'add', label: '🖌️ Paint' },
                  { key: 'erase', label: '🧹 Erase' },
                ].map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setPaintMode(m.key)}
                    className={cn(
                      'flex-1 py-1.5 rounded-md text-xs font-semibold border transition-colors cursor-pointer',
                      paintMode === m.key
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border bg-transparent text-muted-foreground hover:text-foreground hover:bg-accent'
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </Section>

            {/* Brush Size */}
            <Section label={`Brush Size: ${brushSize}`}>
              <Slider
                min={10}
                max={80}
                value={[brushSize]}
                onValueChange={([v]) => setBrushSize(v)}
              />
            </Section>

            {/* Detected muscles */}
            {paintedMuscles.size > 0 && (
              <Section label={`Detected (${paintedMuscles.size})`}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {[...paintedMuscles].map((id) => {
                    const info = EXERCISES[id]
                    if (!info) return null
                    return (
                      <span key={id} style={{ ...styles.tag, background: info.color + '20', color: info.color, borderColor: info.color + '30' }}>
                        {info.label}
                      </span>
                    )
                  })}
                </div>
              </Section>
            )}

            {/* Actions */}
            {paintedMuscles.size > 0 && (
              <Button onClick={() => setShowWorkout(true)} className="w-full" size="sm">
                Generate Workout →
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleClear} className="w-full text-muted-foreground">
              Clear All Paint
            </Button>
          </div>
        )}

        {/* Workout panel */}
        {showWorkout && (
          <WorkoutPanel paintedMuscles={paintedMuscles} onBack={() => setShowWorkout(false)} />
        )}
      </div>

      {/* Mobile bottom toolbar */}
      {isMobile && !showWorkout && (
        <div style={styles.mobileBottom}>
          {/* Row 1: mode toggle + brush size */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 4, flex: 1 }}>
              {[
                { key: 'add', label: '🖌️ Paint' },
                { key: 'erase', label: '🧹 Erase' },
                { key: 'navigate', label: '✋ Move' },
              ].map((m) => (
                <button
                  key={m.key}
                  onClick={() => setPaintMode(m.key)}
                  className={cn(
                    'flex-1 py-2 rounded-md text-xs font-semibold border transition-colors cursor-pointer',
                    paintMode === m.key
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border bg-transparent text-muted-foreground'
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: paintMode === 'navigate' ? 0 : 1, opacity: paintMode === 'navigate' ? 0 : 1, pointerEvents: paintMode === 'navigate' ? 'none' : 'auto', transition: 'opacity 0.2s' }}>
              <span style={{ fontSize: 10, color: '#444', whiteSpace: 'nowrap' }}>Size {brushSize}</span>
              <Slider min={10} max={80} value={[brushSize]} onValueChange={([v]) => setBrushSize(v)} />
            </div>
          </div>

          {/* Row 2: detected muscles + generate (always visible to prevent layout shift) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', minHeight: 22 }}>
              {paintedMuscles.size === 0 ? (
                <span style={{ fontSize: 10, color: '#333', fontStyle: 'italic' }}>Paint the model to detect muscles</span>
              ) : (
                <>
                  {[...paintedMuscles].map((id) => {
                    const info = EXERCISES[id]
                    if (!info) return null
                    return (
                      <span key={id} style={{ ...styles.tag, background: info.color + '20', color: info.color, borderColor: info.color + '30' }}>
                        {info.label}
                      </span>
                    )
                  })}
                  <button
                    onClick={handleClear}
                    style={{ ...styles.tag, background: 'rgba(255,255,255,0.04)', color: '#555', borderColor: 'rgba(255,255,255,0.08)', cursor: 'pointer' }}
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
            <Button onClick={() => setShowWorkout(true)} className="w-full" size="sm" disabled={paintedMuscles.size === 0}>
              Generate Workout →
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ label, children }) {
  return (
    <div>
      <div style={styles.sectionLabel}>{label}</div>
      {children}
    </div>
  )
}

function LoadingOverlay() {
  return (
    <div style={styles.loading}>
      <div style={styles.spinner} />
      <p style={{ marginTop: 16, fontSize: 13, color: '#888' }}>Loading 3D model…</p>
    </div>
  )
}

// ─── Styles ───
const styles = {
  root: {
    width: '100%',
    height: '100%',
    background: '#08080f',
    fontFamily: "'DM Sans', system-ui, sans-serif",
    color: '#d0d0dc',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'relative',
  },
  glow: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(ellipse at 50% 30%, rgba(255,59,92,0.03) 0%, transparent 60%)',
    pointerEvents: 'none',
    zIndex: 0,
  },
  header: {
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    background: 'rgba(8,8,15,0.95)',
    backdropFilter: 'blur(20px)',
    zIndex: 10,
    flexShrink: 0,
  },
  logo: {
    width: 34,
    height: 34,
    borderRadius: 10,
    background: 'linear-gradient(135deg, #ff3b5c, #ff7b3b)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    boxShadow: '0 2px 12px rgba(255,59,92,0.3)',
  },
  logoTitle: { margin: 0, fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' },
  logoSub: { margin: 0, fontSize: 11, color: '#444', letterSpacing: '1.5px', textTransform: 'uppercase' },
  headerBtn: {
    padding: '7px 16px',
    borderRadius: 8,
    border: 'none',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.3s ease',
  },
  main: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    position: 'relative',
    zIndex: 1,
  },
  hints: {
    position: 'absolute',
    bottom: 14,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: 16,
    fontSize: 10,
    color: '#444',
    letterSpacing: '0.5px',
    background: 'rgba(0,0,0,0.5)',
    padding: '6px 16px',
    borderRadius: 20,
    backdropFilter: 'blur(10px)',
    whiteSpace: 'nowrap',
    zIndex: 5,
    pointerEvents: 'none',
  },
  sidebar: {
    width: 230,
    borderLeft: '1px solid rgba(255,255,255,0.04)',
    background: 'rgba(6,6,12,0.7)',
    overflowY: 'auto',
    padding: '14px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    flexShrink: 0,
  },
  sectionLabel: {
    fontSize: 11,
    color: '#444',
    letterSpacing: '2px',
    textTransform: 'uppercase',
    fontWeight: 700,
    marginBottom: 6,
  },
  toggleBtn: {
    flex: 1,
    padding: '7px',
    borderRadius: 7,
    borderWidth: 1,
    borderStyle: 'solid',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.2s',
  },
  slider: {
    width: '100%',
    accentColor: '#ff3b5c',
    height: 4,
  },
  tag: {
    padding: '3px 8px',
    borderRadius: 20,
    fontSize: 9,
    fontWeight: 600,
    borderWidth: 1,
    borderStyle: 'solid',
  },
  generateBtn: {
    padding: '10px',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(135deg, #ff3b5c, #ff7b3b)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: '0 4px 16px rgba(255,59,92,0.3)',
  },
  clearBtn: {
    padding: '7px',
    borderRadius: 7,
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'transparent',
    color: '#555',
    fontSize: 10,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  mobileBottom: {
    padding: '10px 16px',
    paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
    background: 'rgba(6,6,12,0.97)',
    backdropFilter: 'blur(20px)',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    flexShrink: 0,
    zIndex: 10,
  },
  loading: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(8,8,15,0.95)',
    zIndex: 20,
  },
  spinner: {
    width: 48,
    height: 48,
    border: '3px solid rgba(255,59,92,0.2)',
    borderTop: '3px solid #ff3b5c',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
}
