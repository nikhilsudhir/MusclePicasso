import { useState, useEffect } from 'react'
import { EXERCISES, EFFECTIVE_FOR, fetchMuscleExercises, classifyDifficulty, assignRepScheme, assignCalisthenicsRepScheme, getExerciseRole } from './exercises'
import { fetchAllHevyTemplates, fetchHevyUser, resolveHevyTemplateId, createHevyRoutine, buildHevyRoutine } from './hevy'
import { Button } from './components/ui/button'
import { Dialog, DialogClose } from './components/ui/dialog'
import { cn } from './lib/utils'

const DIFF_COLOR = { Beginner: '#3bff8a', Intermediate: '#ffb03b', Advanced: '#ff3b5c' }
const ROLE_COLOR = { 'Main Lift': '#ff3b5c', 'Accessory': '#ff7b3b', 'Isolation': '#3bb8ff' }
const DIFF_FILTERS = ['All', 'Beginner', 'Intermediate', 'Advanced']
const DEFAULT_TOTAL = 6
const FETCH_LIMIT = 25

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [breakpoint])
  return isMobile
}

const BODYWEIGHT_EQUIPMENT = ['body weight', 'assisted', 'band', 'resistance band', 'suspension']

function isBodyweight(exercise) {
  const eq = (exercise.equipments ?? []).map((e) => e.toLowerCase())
  return eq.length === 0 || eq.some((e) => BODYWEIGHT_EQUIPMENT.some((b) => e.includes(b)))
}

// Ranks how gym-accessible an exercise is. Higher = more likely to be in a normal gym.
function gymScore(exercise) {
  const eq = (exercise.equipments ?? []).map((e) => e.toLowerCase()).join(' ')
  if (eq.includes('barbell') || eq.includes('olympic'))  return 10
  if (eq.includes('dumbbell'))                            return 9
  if (eq.includes('cable'))                               return 8
  if (eq.includes('leverage machine') || eq.includes('smith machine')) return 7
  if (eq.includes('ez barbell'))                          return 7
  if (eq.includes('kettlebell'))                          return 6
  if (eq.includes('medicine ball') || eq.includes('weighted')) return 5
  if (eq.includes('body weight'))                         return 3
  if (eq.includes('band') || eq.includes('suspension'))   return 2
  return 4 // unknown / other
}

// Reverse map: apiMuscle name → muscleId (e.g. "pectorals" → "chest")
const API_TO_ID = Object.fromEntries(
  Object.entries(EXERCISES).map(([id, cfg]) => [cfg.apiMuscle, id])
)

// Score an exercise by how effectively it trains the painted muscles.
// Curated effectiveness keywords (10pts) > API target match (3pts) > API secondary match (1pt).
// This ensures e.g. back squat always beats push-up for glutes.
function scoreExercise(ex, paintedMuscleIds) {
  const name = (ex.name ?? '').toLowerCase()
  const targets = (ex.targetMuscles ?? []).map((m) => m.toLowerCase())
  const secondary = (ex.secondaryMuscles ?? []).map((m) => m.toLowerCase())

  return paintedMuscleIds.reduce((total, muscleId) => {
    const apiMuscle = EXERCISES[muscleId]?.apiMuscle ?? ''
    const keywords = EFFECTIVE_FOR[muscleId] ?? []
    if (keywords.some((k) => name.includes(k))) return total + 10
    if (targets.includes(apiMuscle)) return total + 3
    if (secondary.includes(apiMuscle)) return total + 1
    return total
  }, 0)
}

function findBestExercise(exerciseData, paintedMuscleIds, workoutType = 'weights') {
  const paintedApiMuscles = paintedMuscleIds.map((id) => EXERCISES[id]?.apiMuscle).filter(Boolean)
  let best = null
  let bestScore = -1

  for (const [muscleId, exercises] of Object.entries(exerciseData)) {
    const pool = workoutType === 'calisthenics' ? exercises.filter(isBodyweight) : exercises
    for (const ex of pool) {
      const score = scoreExercise(ex, paintedMuscleIds)
      if (score === 0) continue
      const total = score * 10 + gymScore(ex)

      if (total > bestScore) {
        bestScore = total
        const covered = [...new Set([
          ...(ex.targetMuscles ?? []).map((m) => m.toLowerCase()),
          ...(ex.secondaryMuscles ?? []).map((m) => m.toLowerCase()),
        ])]
          .filter((m) => paintedApiMuscles.includes(m))
          .map((m) => EXERCISES[API_TO_ID[m]]?.label)
          .filter(Boolean)
        best = { ...ex, muscleId, score, covered }
      }
    }
  }
  return best
}

// Bigger muscle = higher weight = more exercises allocated
const MUSCLE_WEIGHT = {
  // Large compound muscles
  lats: 3, quads: 3, hamstrings: 3, glute_max: 3,
  // Medium muscles
  upper_chest: 2, lower_chest: 2, mid_back: 2, lower_back: 2, upper_abs: 2, lower_abs: 2,
  // Smaller / isolation muscles
  front_delt: 1, side_delt: 1, rear_delt: 1,
  biceps: 1, triceps: 1, forearms: 1,
  obliques: 1, traps: 1, glute_med: 1,
  gastrocnemius: 1, soleus: 1,
}

// Distribute `total` exercises across muscles proportionally by weight.
// Uses largest-remainder method. Muscles with 0 allocation are omitted.
function distribute(muscleIds, total) {
  if (muscleIds.length === 0) return {}
  const weights = muscleIds.map((id) => MUSCLE_WEIGHT[id] ?? 1)
  const totalWeight = weights.reduce((s, w) => s + w, 0)
  const exact = weights.map((w) => (w / totalWeight) * total)
  const floors = exact.map((e) => Math.floor(e))
  let remaining = total - floors.reduce((s, f) => s + f, 0)
  exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac)
    .forEach(({ i }, k) => { if (k < remaining) floors[i]++ })
  return Object.fromEntries(muscleIds.map((id, i) => [id, floors[i]]))
}

export default function WorkoutPanel({ paintedMuscles, onBack }) {
  const isMobile = useIsMobile()
  const [exerciseData, setExerciseData] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [workoutType, setWorkoutType] = useState('weights') // 'weights' | 'calisthenics'
  const [diffFilter, setDiffFilter] = useState('All')
  const [total, setTotal] = useState(DEFAULT_TOTAL)
  const [selectedEx, setSelectedEx] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const muscleIds = [...paintedMuscles].filter((id) => EXERCISES[id])

    Promise.all(
      muscleIds.map((id) =>
        fetchMuscleExercises(id, FETCH_LIMIT).then((exercises) => ({ id, exercises }))
      )
    )
      .then((results) => {
        if (cancelled) return
        const data = {}
        results.forEach(({ id, exercises }) => { data[id] = exercises })
        setExerciseData(data)
        setLoading(false)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [paintedMuscles])

  const muscleIds = [...paintedMuscles].filter((id) => EXERCISES[id])
  const allocation = distribute(muscleIds, total)
  const activeMuscleIds = muscleIds.filter((id) => (allocation[id] ?? 0) > 0)
  function getExercises(id) {
    let raw = exerciseData[id] ?? []
    if (workoutType === 'calisthenics') raw = raw.filter(isBodyweight)
    const filtered = diffFilter === 'All' ? raw : raw.filter((ex) => classifyDifficulty(ex) === diffFilter)
    const sorted = workoutType === 'weights'
      ? [...filtered].sort((a, b) => gymScore(b) - gymScore(a))
      : filtered
    return sorted.slice(0, allocation[id] ?? 0)
  }

  const bestExercise = !loading && !error ? findBestExercise(exerciseData, muscleIds, workoutType) : null

  const totalShown = activeMuscleIds.reduce((sum, id) => sum + getExercises(id).length, 0)

  // Flat list of all displayed exercises for Hevy export
  const hevyExerciseList = !loading && !error
    ? activeMuscleIds.flatMap((id) =>
        getExercises(id).map((ex, i) => ({
          ex,
          apiMuscle: EXERCISES[id]?.apiMuscle,
          scheme: workoutType === 'calisthenics' ? assignCalisthenicsRepScheme(ex, i) : assignRepScheme(ex, i),
        }))
      )
    : []

  return (
    <>
    <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? 16 : 24 }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-6 text-muted-foreground -ml-1">
          ← Back to Model
        </Button>

        {/* Mode toggle */}
        <div className="flex gap-1 mb-5 p-1 rounded-lg w-fit" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {[
            { key: 'weights',      label: '🏋️ Weights',      accent: '#ff3b5c' },
            { key: 'calisthenics', label: '🤸 Calisthenics',  accent: '#3bff8a' },
          ].map(({ key, label, accent }) => (
            <button
              key={key}
              onClick={() => setWorkoutType(key)}
              className={cn(
                'px-4 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer border-0 font-[inherit]',
                workoutType === key ? 'bg-white/5' : 'bg-transparent hover:bg-white/3'
              )}
              style={{
                color: workoutType === key ? accent : '#555',
                outline: workoutType === key ? `1px solid ${accent}40` : 'none',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <h2 style={{ ...styles.title, fontSize: isMobile ? 22 : 28 }}>Your Painted Workout</h2>
        <p style={styles.subtitle}>
          Targeting {paintedMuscles.size} muscle group
          {paintedMuscles.size !== 1 ? 's' : ''} · {loading ? '…' : `${totalShown} exercises`}
        </p>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'Muscles',   value: paintedMuscles.size,                       color: '#ff3b5c' },
            { label: 'Exercises', value: loading ? '…' : totalShown,                color: '#ff7b3b' },
            { label: 'Est. Time', value: loading ? '…' : `${totalShown * 5}min`,    color: '#3bb8ff' },
          ].map((s) => (
            <div key={s.label} style={{ padding: '8px 16px', borderRadius: 8, background: `${s.color}10`, border: `1px solid ${s.color}20` }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Hevy sync */}
        {!loading && !error && hevyExerciseList.length > 0 && (
          <HevySync exerciseList={hevyExerciseList} workoutType={workoutType} />
        )}

        {/* Hero recommendation */}
        {bestExercise && (
          <div
            style={{ ...styles.hero, cursor: 'pointer' }}
            onClick={() => {
              const role = getExerciseRole(bestExercise, 0)
              const diff = classifyDifficulty(bestExercise)
              const scheme = workoutType === 'calisthenics' ? assignCalisthenicsRepScheme(bestExercise, 0) : assignRepScheme(bestExercise, 0)
              const config = EXERCISES[bestExercise.muscleId] ?? { label: 'Overall', color: '#ffb03b' }
              setSelectedEx({ ex: bestExercise, diff, scheme, role, roleColor: ROLE_COLOR[role], config })
            }}
          >
            <div style={{ fontSize: 9, fontWeight: 700, color: '#ffb03b', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 12 }}>
              ★ Best Overall Pick
            </div>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16, alignItems: isMobile ? 'flex-start' : 'center' }}>
              {bestExercise.gifUrl && (
                <img
                  src={bestExercise.gifUrl}
                  alt={bestExercise.name}
                  style={{ width: isMobile ? '100%' : 88, height: isMobile ? 'auto' : 88, borderRadius: 10, objectFit: 'contain', flexShrink: 0, border: '1px solid rgba(255,176,59,0.2)' }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 900, color: '#fff', textTransform: 'capitalize', marginBottom: 6 }}>
                  {bestExercise.name}
                </div>
                {bestExercise.covered.length > 0 && (
                  <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
                    Covers · {bestExercise.covered.join(', ')}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(() => {
                    const role = getExerciseRole(bestExercise, 0)
                    const roleColor = ROLE_COLOR[role]
                    const diff = classifyDifficulty(bestExercise)
                    return <>
                      <span style={{ fontSize: 9, fontWeight: 700, color: roleColor, background: `${roleColor}18`, border: `1px solid ${roleColor}30`, borderRadius: 4, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: 1 }}>{role}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: DIFF_COLOR[diff], background: `${DIFF_COLOR[diff]}18`, border: `1px solid ${DIFF_COLOR[diff]}30`, borderRadius: 4, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: 1 }}>{diff}</span>
                      {bestExercise.equipments?.[0] && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#666', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '2px 6px', textTransform: 'capitalize', letterSpacing: 1 }}>{bestExercise.equipments[0]}</span>
                      )}
                    </>
                  })()}
                </div>
              </div>
              <div style={{ ...styles.setsbadge, fontSize: 16, padding: '8px 14px', flexShrink: 0 }}>
                {workoutType === 'calisthenics' ? assignCalisthenicsRepScheme(bestExercise, 0) : assignRepScheme(bestExercise, 0)}
              </div>
            </div>
          </div>
        )}

        {/* Loading / error */}
        {loading && (
          <div style={styles.stateBox}>
            <div style={styles.spinner} />
            <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>Fetching exercises…</span>
          </div>
        )}
        {error && (
          <div style={{ ...styles.stateBox, color: '#ff3b5c', fontSize: 13 }}>
            Failed to load exercises: {error}
          </div>
        )}

        {/* Controls */}
        {!loading && !error && (
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? 10 : 16, marginBottom: 20 }}>
            {/* Difficulty filter */}
            <div className="flex items-center gap-1.5">
              <span style={styles.controlLabel}>Difficulty</span>
              {DIFF_FILTERS.map((f) => {
                const active = diffFilter === f
                const accent = f === 'All' ? '#ff7b3b' : DIFF_COLOR[f]
                return (
                  <Button
                    key={f}
                    size="sm"
                    variant="ghost"
                    onClick={() => setDiffFilter(f)}
                    className="text-[10px] h-6 px-2.5 font-semibold transition-colors"
                    style={active ? {
                      color: accent,
                      background: accent + '15',
                      border: `1px solid ${accent}50`,
                    } : { color: '#555' }}
                  >
                    {f}
                  </Button>
                )
              })}
            </div>

            {/* Total exercise count */}
            <div className="flex items-center gap-2">
              <span style={styles.controlLabel}>Total exercises</span>
              <Button variant="outline" size="icon" onClick={() => setTotal((t) => Math.max(1, t - 1))}>−</Button>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#ccc', minWidth: 16, textAlign: 'center' }}>
                {total}
              </span>
              <Button variant="outline" size="icon" onClick={() => setTotal((t) => Math.min(50, t + 1))}>+</Button>
            </div>
          </div>
        )}

        {/* Exercise cards */}
        {!loading && !error && activeMuscleIds.map((id) => {
          const config = EXERCISES[id]
          const exercises = getExercises(id)
          const slot = allocation[id]

          return (
            <div key={id} style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: config.color, boxShadow: `0 0 8px ${config.color}40` }} />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#fff' }}>{config.label}</h3>
                <span style={{ fontSize: 11, color: '#444' }}>{slot} slot{slot !== 1 ? 's' : ''}</span>
              </div>

              {exercises.length === 0 ? (
                <div style={{ fontSize: 12, color: '#444', padding: '8px 0' }}>
                  No {diffFilter !== 'All' ? diffFilter.toLowerCase() + ' ' : ''}exercises found — try a different filter.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {exercises.map((ex, i) => {
                    const diff = classifyDifficulty(ex)
                    const scheme = workoutType === 'calisthenics' ? assignCalisthenicsRepScheme(ex, i) : assignRepScheme(ex, i)
                    const role = getExerciseRole(ex, i)
                    const roleColor = ROLE_COLOR[role]
                    return (
                      <div key={ex.exerciseId} onClick={() => setSelectedEx({ ex, diff, scheme, role, roleColor, config })} style={{ ...styles.card, borderLeft: `3px solid ${config.color}`, cursor: 'pointer' }}>
                        {ex.gifUrl && (
                          <img src={ex.gifUrl} alt={ex.name} style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#eee', textTransform: 'capitalize' }}>{ex.name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                            <span style={{
                              fontSize: 9, fontWeight: 700, color: roleColor,
                              background: `${roleColor}18`, border: `1px solid ${roleColor}30`,
                              borderRadius: 4, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: 1,
                            }}>
                              {role}
                            </span>
                            <span style={{
                              fontSize: 9, fontWeight: 700, color: DIFF_COLOR[diff],
                              background: `${DIFF_COLOR[diff]}18`, border: `1px solid ${DIFF_COLOR[diff]}30`,
                              borderRadius: 4, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: 1,
                            }}>
                              {diff}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                          <div style={styles.setsbadge}>{scheme}</div>
                          {ex.equipments?.length > 0 && (
                            <div style={styles.equipment}>{ex.equipments[0]}</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* Tips */}
        <div style={styles.tips}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#ff7b3b', marginBottom: 8, letterSpacing: 1 }}>
            💡 TRAINING TIPS
          </div>
          {workoutType === 'calisthenics' ? (
            <div style={{ fontSize: 12, color: '#555', lineHeight: 2 }}>
              Master form before increasing reps or progressions<br />
              Rest 60-90s between sets; shorter rest for endurance gains<br />
              Progress via harder variations (e.g. archer → one-arm)<br />
              Train each movement pattern 3× per week for skill development
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#555', lineHeight: 2 }}>
              Warm up 5-10 minutes before starting<br />
              Rest 60-90s between hypertrophy sets<br />
              Track your weights for progressive overload<br />
              Train each muscle group 2× per week for optimal growth
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Exercise detail popout */}
    <Dialog open={!!selectedEx} onClose={() => setSelectedEx(null)}>
      {selectedEx && <ExerciseDetail {...selectedEx} onClose={() => setSelectedEx(null)} />}
    </Dialog>
    </>
  )
}

function HevySync({ exerciseList, workoutType }) {
  const [savedKey]    = useState(() => localStorage.getItem('hevy_api_key') || '')
  const [username, setUsername] = useState(() => localStorage.getItem('hevy_username') || '')
  const connected = !!(savedKey && username)

  // Connect dialog state
  const [showConnect, setShowConnect] = useState(false)
  const [inputKey, setInputKey]       = useState('')
  const [connecting, setConnecting]   = useState(false)
  const [connectErr, setConnectErr]   = useState('')

  // Send state
  const [sendStatus, setSendStatus]   = useState('idle') // idle | loading | success | error
  const [sendErr, setSendErr]         = useState('')

  async function handleConnect() {
    const key = inputKey.trim()
    if (!key) return
    setConnecting(true)
    setConnectErr('')
    try {
      const user = await fetchHevyUser(key)
      const name = user.user?.username ?? user.username ?? 'your account'
      localStorage.setItem('hevy_api_key', key)
      localStorage.setItem('hevy_username', name)
      setUsername(name)
      setShowConnect(false)
      setInputKey('')
    } catch (err) {
      setConnectErr(err.message.includes('401') ? 'Invalid API key' : `Error: ${err.message}`)
    } finally {
      setConnecting(false)
    }
  }

  function handleDisconnect() {
    localStorage.removeItem('hevy_api_key')
    localStorage.removeItem('hevy_username')
    setUsername('')
    setSendStatus('idle')
  }

  async function handleSend() {
    const key = localStorage.getItem('hevy_api_key')
    if (!key) return
    setSendStatus('loading')
    setSendErr('')
    try {
      const templates = await fetchAllHevyTemplates(key)
      const created = {}
      const items = []
      const failures = []
      // Sequential to avoid parallel duplicate template creation
      for (const { ex, apiMuscle, scheme } of exerciseList) {
        try {
          const templateId = await resolveHevyTemplateId(key, ex, apiMuscle, templates, created)
          if (templateId) items.push({ templateId, scheme })
        } catch (err) {
          failures.push(`${ex.name}: ${err.message}`)
        }
      }
      if (items.length === 0) throw new Error(`All exercises failed.\n${failures.join('\n')}`)
      const routine = buildHevyRoutine(items, workoutType, `Muscle Picasso — ${new Date().toLocaleDateString()}`)
      await createHevyRoutine(key, routine)
      if (failures.length > 0) console.warn('Hevy skipped exercises:', failures)
      setSendStatus(`success:${items.length}:${failures.length}`)
    } catch (err) {
      setSendErr(err.message.includes('401') ? 'Session expired — reconnect' : err.message.slice(0, 120))
      setSendStatus('error')
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Connect dialog */}
      {showConnect && (
        <div style={{
          marginBottom: 10, padding: '14px 16px', borderRadius: 10,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#ccc', marginBottom: 10 }}>
            Connect your Hevy account
          </div>
          <div style={{ fontSize: 11, color: '#555', marginBottom: 10, lineHeight: 1.6 }}>
            Paste your API key from{' '}
            <a href="https://hevy.com/settings?developer" target="_blank" rel="noreferrer"
              style={{ color: '#3bb8ff', textDecoration: 'none' }}>
              hevy.com/settings?developer
            </a>
            {' '}(requires Hevy Pro).
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="password"
              placeholder="Paste API key…"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              autoFocus
              style={{
                flex: 1, padding: '6px 10px', borderRadius: 7,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#ccc', fontSize: 12, fontFamily: 'inherit', outline: 'none',
              }}
            />
            <Button size="sm" onClick={handleConnect} disabled={connecting || !inputKey.trim()}>
              {connecting ? 'Connecting…' : 'Connect'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowConnect(false); setConnectErr('') }}>
              Cancel
            </Button>
          </div>
          {connectErr && (
            <div style={{ fontSize: 11, color: '#ff3b5c', marginTop: 6 }}>{connectErr}</div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {connected ? (
          <>
            {/* Account pill */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 10px', borderRadius: 20,
              background: 'rgba(59,255,138,0.06)', border: '1px solid rgba(59,255,138,0.15)',
            }}>
              <img src="https://hevy.com/favicon.ico" alt="" style={{ width: 12, height: 12, borderRadius: 2, opacity: 0.8 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#3bff8a' }}>@{username}</span>
              <button
                onClick={handleDisconnect}
                style={{ background: 'none', border: 'none', color: '#555', fontSize: 11, cursor: 'pointer', padding: 0, lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            {/* Send button */}
            {(() => {
              const isSuccess = sendStatus.startsWith('success')
              const [, added, skipped] = sendStatus.split(':')
              return (
                <>
                  <button
                    onClick={!isSuccess ? handleSend : undefined}
                    disabled={sendStatus === 'loading'}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 14px', borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: isSuccess ? 'rgba(59,255,138,0.08)' : 'rgba(255,255,255,0.03)',
                      color: isSuccess ? '#3bff8a' : sendStatus === 'loading' ? '#555' : '#aaa',
                      fontSize: 12, fontWeight: 600,
                      cursor: sendStatus === 'loading' || isSuccess ? 'default' : 'pointer',
                      fontFamily: 'inherit', transition: 'all 0.2s',
                    }}
                  >
                    {sendStatus === 'loading'
                      ? 'Sending…'
                      : isSuccess
                        ? `✓ ${added} exercise${added === '1' ? '' : 's'} added to Hevy`
                        : 'Add routine to Hevy'}
                  </button>
                  {isSuccess && parseInt(skipped) > 0 && (
                    <span style={{ fontSize: 11, color: '#666' }}>{skipped} skipped — check console</span>
                  )}
                  {sendStatus === 'error' && (
                    <span style={{ fontSize: 11, color: '#ff3b5c' }}>{sendErr}</span>
                  )}
                </>
              )
            })()}
          </>
        ) : (
          <button
            onClick={() => setShowConnect(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
              color: '#888', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <img src="https://hevy.com/favicon.ico" alt="" style={{ width: 13, height: 13, borderRadius: 2, opacity: 0.7 }} />
            Connect Hevy account
          </button>
        )}
      </div>
    </div>
  )
}

function ExerciseDetail({ ex, diff, scheme, role, roleColor, config, onClose }) {
  return (
    <>
      <DialogClose onClose={onClose} />

      {/* GIF header */}
      {ex.gifUrl && (
        <div style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <img
            src={ex.gifUrl}
            alt={ex.name}
            style={{ width: '100%', height: 220, objectFit: 'contain', display: 'block' }}
          />
        </div>
      )}

      <div style={{ padding: '20px 20px 24px' }}>
        {/* Name + scheme */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#fff', textTransform: 'capitalize', lineHeight: 1.3 }}>
            {ex.name}
          </h2>
          <div style={{ ...styles.setsbadge, flexShrink: 0 }}>{scheme}</div>
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: roleColor, background: `${roleColor}18`, border: `1px solid ${roleColor}30`, borderRadius: 4, padding: '3px 8px', textTransform: 'uppercase', letterSpacing: 1 }}>
            {role}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: DIFF_COLOR[diff], background: `${DIFF_COLOR[diff]}18`, border: `1px solid ${DIFF_COLOR[diff]}30`, borderRadius: 4, padding: '3px 8px', textTransform: 'uppercase', letterSpacing: 1 }}>
            {diff}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: config.color, background: `${config.color}15`, border: `1px solid ${config.color}30`, borderRadius: 4, padding: '3px 8px', textTransform: 'capitalize', letterSpacing: 0.5 }}>
            {config.label}
          </span>
        </div>

        {/* Details grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {ex.targetMuscles?.length > 0 && (
            <DetailRow label="Target" value={ex.targetMuscles.join(', ')} />
          )}
          {ex.secondaryMuscles?.length > 0 && (
            <DetailRow label="Secondary" value={ex.secondaryMuscles.join(', ')} />
          )}
          {ex.equipments?.length > 0 && (
            <DetailRow label="Equipment" value={ex.equipments.join(', ')} />
          )}
          {ex.bodyParts?.length > 0 && (
            <DetailRow label="Body Part" value={ex.bodyParts.join(', ')} />
          )}
        </div>
      </div>
    </>
  )
}

function DetailRow({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#444', textTransform: 'uppercase', letterSpacing: '1.5px', minWidth: 80, paddingTop: 1 }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: '#888', textTransform: 'capitalize', lineHeight: 1.5 }}>
        {value}
      </span>
    </div>
  )
}

const styles = {
  backBtn: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
    background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8,
    color: '#888', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 24,
  },
  title: {
    fontSize: 28, fontWeight: 900, margin: '0 0 6px',
    background: 'linear-gradient(135deg, #ff3b5c, #ff7b3b, #ffb03b)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
  },
  subtitle: { fontSize: 15, color: '#555', margin: '0 0 20px' },
  controlLabel: { fontSize: 13, color: '#444', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 700 },
  countBtn: {
    width: 24, height: 24, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.04)', color: '#888', fontSize: 14, lineHeight: 1,
    cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  card: {
    display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
    borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
  },
  hero: {
    marginBottom: 28, padding: 20, borderRadius: 14,
    background: 'linear-gradient(135deg, rgba(255,176,59,0.06), rgba(255,59,92,0.04))',
    border: '1px solid rgba(255,176,59,0.18)',
    boxShadow: '0 0 32px rgba(255,176,59,0.05)',
  },
  setsbadge: {
    padding: '4px 10px', borderRadius: 6,
    background: 'rgba(59,184,255,0.08)', border: '1px solid rgba(59,184,255,0.2)',
    fontSize: 12, fontWeight: 800, color: '#3bb8ff',
    fontFamily: "'DM Mono', monospace", whiteSpace: 'nowrap',
  },
  equipment: {
    padding: '5px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.04)',
    fontSize: 11, fontWeight: 700, color: '#bbb', fontFamily: "'DM Mono', monospace",
    textTransform: 'capitalize', whiteSpace: 'nowrap', flexShrink: 0,
  },
  stateBox: { display: 'flex', alignItems: 'center', padding: '20px 0' },
  spinner: {
    width: 20, height: 20, border: '2px solid rgba(255,59,92,0.2)',
    borderTop: '2px solid #ff3b5c', borderRadius: '50%',
    animation: 'spin 1s linear infinite', flexShrink: 0,
  },
  tips: {
    marginTop: 24, padding: 20, borderRadius: 12,
    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
  },
}
