import { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Image,
} from 'react-native'
import {
  EXERCISES,
  EFFECTIVE_FOR,
  fetchMuscleExercises,
  classifyDifficulty,
  assignRepScheme,
  assignCalisthenicsRepScheme,
  getExerciseRole,
} from './exercises'

const DIFF_COLOR: Record<string, string> = {
  Beginner: '#3bff8a',
  Intermediate: '#ffb03b',
  Advanced: '#ff3b5c',
}
const ROLE_COLOR: Record<string, string> = {
  'Main Lift': '#ff3b5c',
  Accessory: '#ff7b3b',
  Isolation: '#3bb8ff',
}
const DIFF_FILTERS = ['All', 'Beginner', 'Intermediate', 'Advanced']
const DEFAULT_TOTAL = 6
const FETCH_LIMIT = 25

const BODYWEIGHT_EQUIPMENT = ['body weight', 'assisted', 'band', 'resistance band', 'suspension']

function isBodyweight(exercise: any) {
  const eq = (exercise.equipments ?? []).map((e: string) => e.toLowerCase())
  return eq.length === 0 || eq.some((e: string) => BODYWEIGHT_EQUIPMENT.some((b) => e.includes(b)))
}

function gymScore(exercise: any) {
  const eq = (exercise.equipments ?? []).map((e: string) => e.toLowerCase()).join(' ')
  if (eq.includes('barbell') || eq.includes('olympic')) return 10
  if (eq.includes('dumbbell')) return 9
  if (eq.includes('cable')) return 8
  if (eq.includes('leverage machine') || eq.includes('smith machine')) return 7
  if (eq.includes('ez barbell')) return 7
  if (eq.includes('kettlebell')) return 6
  if (eq.includes('medicine ball') || eq.includes('weighted')) return 5
  if (eq.includes('body weight')) return 3
  if (eq.includes('band') || eq.includes('suspension')) return 2
  return 4
}

const API_TO_ID: Record<string, string> = Object.fromEntries(
  Object.entries(EXERCISES as Record<string, any>).map(([id, cfg]: [string, any]) => [cfg.apiMuscle, id])
)

function scoreExercise(ex: any, paintedMuscleIds: string[]) {
  const name = (ex.name ?? '').toLowerCase()
  const targets = (ex.targetMuscles ?? []).map((m: string) => m.toLowerCase())
  const secondary = (ex.secondaryMuscles ?? []).map((m: string) => m.toLowerCase())

  return paintedMuscleIds.reduce((total, muscleId) => {
    const apiMuscle = (EXERCISES as any)[muscleId]?.apiMuscle ?? ''
    const keywords = (EFFECTIVE_FOR as any)[muscleId] ?? []
    if (keywords.some((k: string) => name.includes(k))) return total + 10
    if (targets.includes(apiMuscle)) return total + 3
    if (secondary.includes(apiMuscle)) return total + 1
    return total
  }, 0)
}

function findBestExercise(exerciseData: Record<string, any[]>, paintedMuscleIds: string[]) {
  const paintedApiMuscles = paintedMuscleIds
    .map((id) => (EXERCISES as any)[id]?.apiMuscle)
    .filter(Boolean)
  let best: any = null
  let bestScore = -1

  for (const [, exercises] of Object.entries(exerciseData)) {
    for (const ex of exercises) {
      const score = scoreExercise(ex, paintedMuscleIds)
      if (score === 0) continue
      const total = score * 10 + gymScore(ex)
      if (total > bestScore) {
        bestScore = total
        const covered = [
          ...new Set([
            ...(ex.targetMuscles ?? []).map((m: string) => m.toLowerCase()),
            ...(ex.secondaryMuscles ?? []).map((m: string) => m.toLowerCase()),
          ]),
        ]
          .filter((m) => paintedApiMuscles.includes(m))
          .map((m) => (EXERCISES as any)[API_TO_ID[m]]?.label)
          .filter(Boolean)
        best = { ...ex, score, covered }
      }
    }
  }
  return best
}

const MUSCLE_WEIGHT: Record<string, number> = {
  lats: 3, quads: 3, hamstrings: 3, glute_max: 3,
  upper_chest: 2, lower_chest: 2, mid_back: 2, lower_back: 2, upper_abs: 2, lower_abs: 2,
  front_delt: 1, side_delt: 1, rear_delt: 1,
  biceps: 1, triceps: 1, forearms: 1,
  obliques: 1, traps: 1, glute_med: 1,
  gastrocnemius: 1, soleus: 1,
}

function distribute(muscleIds: string[], total: number) {
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

interface WorkoutPanelProps {
  paintedMuscles: Set<string>
  onBack: () => void
}

export default function WorkoutPanel({ paintedMuscles, onBack }: WorkoutPanelProps) {
  const [exerciseData, setExerciseData] = useState<Record<string, any[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workoutType, setWorkoutType] = useState<'weights' | 'calisthenics'>('weights')
  const [diffFilter, setDiffFilter] = useState('All')
  const [total, setTotal] = useState(DEFAULT_TOTAL)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const muscleIds = [...paintedMuscles].filter((id) => (EXERCISES as any)[id])

    Promise.all(
      muscleIds.map((id) =>
        fetchMuscleExercises(id, FETCH_LIMIT).then((exercises) => ({ id, exercises }))
      )
    )
      .then((results) => {
        if (cancelled) return
        const data: Record<string, any[]> = {}
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

  const muscleIds = [...paintedMuscles].filter((id) => (EXERCISES as any)[id])
  const allocation = distribute(muscleIds, total)
  const activeMuscleIds = muscleIds.filter((id) => (allocation[id] ?? 0) > 0)

  function getExercises(id: string) {
    let raw = exerciseData[id] ?? []
    if (workoutType === 'calisthenics') raw = raw.filter(isBodyweight)
    const filtered = diffFilter === 'All' ? raw : raw.filter((ex) => classifyDifficulty(ex) === diffFilter)
    const sorted =
      workoutType === 'weights' ? [...filtered].sort((a, b) => gymScore(b) - gymScore(a)) : filtered
    return sorted.slice(0, allocation[id] ?? 0)
  }

  const bestExercise = !loading && !error ? findBestExercise(exerciseData, muscleIds) : null
  const totalShown = activeMuscleIds.reduce((sum, id) => sum + getExercises(id).length, 0)

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Back button */}
      <TouchableOpacity onPress={onBack} style={styles.backBtn}>
        <Text style={styles.backBtnText}>← Back to Model</Text>
      </TouchableOpacity>

      {/* Mode toggle */}
      <View style={styles.modeRow}>
        {[
          { key: 'weights', label: '🏋️ Weights', accent: '#ff3b5c' },
          { key: 'calisthenics', label: '🤸 Calisthenics', accent: '#3bff8a' },
        ].map(({ key, label, accent }) => (
          <TouchableOpacity
            key={key}
            onPress={() => setWorkoutType(key as 'weights' | 'calisthenics')}
            style={[
              styles.modeBtn,
              workoutType === key && { backgroundColor: accent + '20', borderColor: accent + '50' },
            ]}
          >
            <Text style={[styles.modeBtnText, { color: workoutType === key ? accent : '#555' }]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Title */}
      <Text style={styles.title}>Your Painted Workout</Text>
      <Text style={styles.subtitle}>
        Targeting {paintedMuscles.size} muscle group{paintedMuscles.size !== 1 ? 's' : ''} ·{' '}
        {loading ? '…' : `${totalShown} exercises`}
      </Text>

      {/* Stats */}
      <View style={styles.statsRow}>
        {[
          { label: 'Muscles', value: String(paintedMuscles.size), color: '#ff3b5c' },
          { label: 'Exercises', value: loading ? '…' : String(totalShown), color: '#ff7b3b' },
          { label: 'Est. Time', value: loading ? '…' : `${totalShown * 5}min`, color: '#3bb8ff' },
        ].map((s) => (
          <View key={s.label} style={[styles.statBox, { borderColor: s.color + '30', backgroundColor: s.color + '10' }]}>
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Hero */}
      {bestExercise && (
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>★ Best Overall Pick</Text>
          <View style={styles.heroRow}>
            {bestExercise.gifUrl ? (
              <Image source={{ uri: bestExercise.gifUrl }} style={styles.heroGif} />
            ) : null}
            <View style={styles.heroInfo}>
              <Text style={styles.heroName}>{bestExercise.name}</Text>
              {bestExercise.covered?.length > 0 && (
                <Text style={styles.heroCovered}>Covers · {bestExercise.covered.join(', ')}</Text>
              )}
              <View style={styles.badgeRow}>
                {(() => {
                  const role = getExerciseRole(bestExercise, 0)
                  const diff = classifyDifficulty(bestExercise)
                  return (
                    <>
                      <Badge label={role} color={ROLE_COLOR[role] ?? '#888'} />
                      <Badge label={diff} color={DIFF_COLOR[diff] ?? '#888'} />
                      {bestExercise.equipments?.[0] && (
                        <Badge label={bestExercise.equipments[0]} color="#666" />
                      )}
                    </>
                  )
                })()}
              </View>
            </View>
            <View style={styles.setsBox}>
              <Text style={styles.setsText}>
                {workoutType === 'calisthenics'
                  ? assignCalisthenicsRepScheme(bestExercise, 0)
                  : assignRepScheme(bestExercise, 0)}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Loading / error */}
      {loading && (
        <View style={styles.stateBox}>
          <ActivityIndicator color="#ff3b5c" />
          <Text style={styles.stateText}>Fetching exercises…</Text>
        </View>
      )}
      {error && (
        <View style={styles.stateBox}>
          <Text style={[styles.stateText, { color: '#ff3b5c' }]}>Failed to load: {error}</Text>
        </View>
      )}

      {/* Controls */}
      {!loading && !error && (
        <View style={styles.controlsRow}>
          {/* Difficulty filter */}
          <View style={styles.filterGroup}>
            <Text style={styles.controlLabel}>Difficulty</Text>
            <View style={styles.filterBtns}>
              {DIFF_FILTERS.map((f) => {
                const active = diffFilter === f
                const accent = f === 'All' ? '#ff7b3b' : DIFF_COLOR[f]
                return (
                  <TouchableOpacity
                    key={f}
                    onPress={() => setDiffFilter(f)}
                    style={[
                      styles.filterBtn,
                      active && { backgroundColor: accent + '20', borderColor: accent + '50' },
                    ]}
                  >
                    <Text style={[styles.filterBtnText, { color: active ? accent : '#555' }]}>{f}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* Total count */}
          <View style={styles.countGroup}>
            <Text style={styles.controlLabel}>Total</Text>
            <View style={styles.countRow}>
              <TouchableOpacity onPress={() => setTotal((t) => Math.max(1, t - 1))} style={styles.countBtn}>
                <Text style={styles.countBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.countValue}>{total}</Text>
              <TouchableOpacity onPress={() => setTotal((t) => Math.min(50, t + 1))} style={styles.countBtn}>
                <Text style={styles.countBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Exercise sections */}
      {!loading &&
        !error &&
        activeMuscleIds.map((id) => {
          const config = (EXERCISES as any)[id]
          const exercises = getExercises(id)
          const slot = allocation[id]

          return (
            <View key={id} style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.dot, { backgroundColor: config.color, shadowColor: config.color }]} />
                <Text style={styles.sectionTitle}>{config.label}</Text>
                <Text style={styles.sectionSlots}>
                  {slot} slot{slot !== 1 ? 's' : ''}
                </Text>
              </View>

              {exercises.length === 0 ? (
                <Text style={styles.emptyText}>
                  No {diffFilter !== 'All' ? diffFilter.toLowerCase() + ' ' : ''}exercises found
                </Text>
              ) : (
                exercises.map((ex: any, i: number) => {
                  const diff = classifyDifficulty(ex)
                  const scheme =
                    workoutType === 'calisthenics'
                      ? assignCalisthenicsRepScheme(ex, i)
                      : assignRepScheme(ex, i)
                  const role = getExerciseRole(ex, i)
                  return (
                    <View
                      key={ex.exerciseId ?? i}
                      style={[styles.card, { borderLeftColor: config.color }]}
                    >
                      {ex.gifUrl ? (
                        <Image source={{ uri: ex.gifUrl }} style={styles.cardGif} />
                      ) : null}
                      <View style={styles.cardInfo}>
                        <Text style={styles.cardName}>{ex.name}</Text>
                        <View style={styles.badgeRow}>
                          <Badge label={role} color={ROLE_COLOR[role] ?? '#888'} />
                          <Badge label={diff} color={DIFF_COLOR[diff] ?? '#888'} />
                        </View>
                      </View>
                      <View style={styles.cardRight}>
                        <View style={styles.setsBox}>
                          <Text style={styles.setsText}>{scheme}</Text>
                        </View>
                        {ex.equipments?.[0] && (
                          <Text style={styles.equipText}>{ex.equipments[0]}</Text>
                        )}
                      </View>
                    </View>
                  )
                })
              )}
            </View>
          )
        })}

      {/* Tips */}
      <View style={styles.tips}>
        <Text style={styles.tipsTitle}>💡 TRAINING TIPS</Text>
        {workoutType === 'calisthenics' ? (
          <Text style={styles.tipsText}>
            {'Master form before increasing reps or progressions\nRest 60-90s between sets\nProgress via harder variations (e.g. archer → one-arm)\nTrain each movement pattern 3× per week'}
          </Text>
        ) : (
          <Text style={styles.tipsText}>
            {'Warm up 5-10 minutes before starting\nRest 60-90s between hypertrophy sets\nTrack your weights for progressive overload\nTrain each muscle group 2× per week for optimal growth'}
          </Text>
        )}
      </View>
    </ScrollView>
  )
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color + '20', borderColor: color + '40' }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#08080f' },
  content: { padding: 20, paddingBottom: 40 },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 20,
  },
  backBtnText: { color: '#888', fontSize: 13, fontWeight: '600' },
  modeRow: { flexDirection: 'row', gap: 6, marginBottom: 20 },
  modeBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'transparent',
  },
  modeBtnText: { fontSize: 13, fontWeight: '700' },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 6,
  },
  subtitle: { fontSize: 13, color: '#555', marginBottom: 20 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statBox: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 },
  hero: {
    marginBottom: 24,
    padding: 18,
    borderRadius: 14,
    backgroundColor: 'rgba(255,176,59,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,176,59,0.2)',
  },
  heroLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#ffb03b',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroGif: { width: 80, height: 80, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,176,59,0.2)' },
  heroInfo: { flex: 1 },
  heroName: { fontSize: 17, fontWeight: '900', color: '#fff', textTransform: 'capitalize', marginBottom: 4 },
  heroCovered: { fontSize: 11, color: '#666', marginBottom: 8 },
  stateBox: { flexDirection: 'row', alignItems: 'center', paddingVertical: 20, gap: 12 },
  stateText: { color: '#555', fontSize: 13 },
  controlsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 20, marginBottom: 24 },
  filterGroup: { flex: 1 },
  filterBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  filterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  filterBtnText: { fontSize: 10, fontWeight: '600' },
  countGroup: { alignItems: 'center' },
  controlLabel: { fontSize: 9, color: '#444', letterSpacing: 2, textTransform: 'uppercase', fontWeight: '700' },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  countBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBtnText: { color: '#888', fontSize: 16 },
  countValue: { fontSize: 14, fontWeight: '700', color: '#ccc', minWidth: 20, textAlign: 'center' },
  section: { marginBottom: 28 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  dot: { width: 11, height: 11, borderRadius: 6, shadowRadius: 4, shadowOpacity: 0.4 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#fff', flex: 1 },
  sectionSlots: { fontSize: 11, color: '#444' },
  emptyText: { fontSize: 12, color: '#444', paddingVertical: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderLeftWidth: 3,
    marginBottom: 6,
  },
  cardGif: { width: 48, height: 48, borderRadius: 7 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 13, fontWeight: '700', color: '#eee', textTransform: 'capitalize', marginBottom: 4 },
  cardRight: { alignItems: 'flex-end', gap: 4 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  badgeText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  setsBox: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(59,184,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(59,184,255,0.25)',
  },
  setsText: { fontSize: 12, fontWeight: '800', color: '#3bb8ff' },
  equipText: { fontSize: 10, color: '#777', textTransform: 'capitalize' },
  tips: {
    marginTop: 8,
    padding: 18,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  tipsTitle: { fontSize: 10, fontWeight: '700', color: '#ff7b3b', letterSpacing: 1, marginBottom: 10 },
  tipsText: { fontSize: 12, color: '#555', lineHeight: 22 },
})
