const HEVY_BASE = 'https://api.hevyapp.com'

// exercisedb apiMuscle → Hevy primary_muscle_group
const HEVY_MUSCLE = {
  pectorals:    'chest',
  delts:        'shoulders',
  biceps:       'biceps',
  triceps:      'triceps',
  forearms:     'forearms',
  abs:          'abdominals',
  lats:         'lats',
  'upper back': 'upper_back',
  spine:        'lower_back',
  traps:        'traps',
  glutes:       'glutes',
  quads:        'quadriceps',
  hamstrings:   'hamstrings',
  calves:       'calves',
}

// exercisedb equipment name → Hevy equipment_category
const HEVY_EQUIPMENT = {
  'barbell':          'barbell',
  'olympic barbell':  'barbell',
  'ez barbell':       'barbell',
  'trap bar':         'barbell',
  'dumbbell':         'dumbbell',
  'kettlebell':       'kettlebell',
  'cable':            'machine',
  'leverage machine': 'machine',
  'smith machine':    'machine',
  'sled machine':     'machine',
  'resistance band':  'resistance_band',
  'band':             'resistance_band',
  'suspension':       'suspension',
  'body weight':      'none',
  'assisted':         'none',
}

function mapEquipment(equipments = []) {
  for (const e of equipments) {
    const key = e.toLowerCase()
    for (const [k, v] of Object.entries(HEVY_EQUIPMENT)) {
      if (key.includes(k)) return v
    }
  }
  return 'other'
}

function mapExerciseType(equipments = []) {
  const eq = equipments.map(e => e.toLowerCase()).join(' ')
  if (eq.includes('body weight') || eq.includes('assisted') || eq.includes('suspension')) return 'bodyweight_reps'
  return 'weight_reps'
}

async function hevyFetch(path, apiKey, options = {}) {
  const res = await fetch(`${HEVY_BASE}${path}`, {
    ...options,
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let msg = `${res.status}`
    try { const j = JSON.parse(text); msg = j.message ?? j.error ?? msg } catch {}
    throw new Error(msg)
  }
  const text = await res.text()
  try { return JSON.parse(text) } catch { return text }
}

export async function fetchAllHevyTemplates(apiKey) {
  const templates = []
  let page = 1
  while (true) {
    const data = await hevyFetch(`/v1/exercise_templates?page=${page}&pageSize=100`, apiKey)
    const items = data.exercise_templates ?? []
    templates.push(...items)
    if (page >= (data.page_count ?? 1) || items.length < 100) break
    page++
  }
  return templates
}

export async function fetchHevyUser(apiKey) {
  return hevyFetch('/v1/user/info', apiKey)
}

async function createHevyExerciseTemplate(apiKey, ex, apiMuscle) {
  const body = {
    exercise: {
      title: ex.name,
      exercise_type: mapExerciseType(ex.equipments),
      equipment_category: mapEquipment(ex.equipments),
      muscle_group: HEVY_MUSCLE[apiMuscle?.toLowerCase()] ?? 'other',
      other_muscles: [],
    },
  }
  const data = await hevyFetch('/v1/exercise_templates', apiKey, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  // Hevy returns a plain UUID string or an object with an id field
  const id = typeof data === 'string' ? data.trim()
    : (data.id ?? data.exercise_template?.id ?? data.exercise?.id ?? data.data?.id)
  if (!id) throw new Error(`No ID in response for "${ex.name}": ${JSON.stringify(data)}`)
  return id
}

export async function createHevyRoutine(apiKey, routine) {
  return hevyFetch('/v1/routines', apiKey, {
    method: 'POST',
    body: JSON.stringify({ routine }),
  })
}

// Strip equipment qualifiers and punctuation for comparison.
// "Barbell Bench Press" and "Bench Press (Barbell)" both become "bench press".
function normalize(name) {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/\b(barbell|dumbbell|cable|machine|kettlebell|smith|bodyweight|body weight|weighted|leverage|ez|olympic|trap bar|resistance band)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function wordOverlap(a, b) {
  const wa = new Set(normalize(a).split(' ').filter(Boolean))
  const wb = new Set(normalize(b).split(' ').filter(Boolean))
  if (!wa.size || !wb.size) return 0
  let shared = 0
  for (const w of wa) if (wb.has(w)) shared++
  return shared / Math.max(wa.size, wb.size)
}

/**
 * Find a matching Hevy template for the given exercise name.
 * Pass 1: exact normalized name match across all templates.
 * Pass 2: best word-overlap match (≥ 0.55) within the same muscle group.
 * Returns null only if no suitable match exists.
 */
function findMatchingTemplate(exerciseName, apiMuscle, templates) {
  // Pass 1 — exact
  const target = normalize(exerciseName)
  const exact = templates.find(t => normalize(t.title) === target)
  if (exact) return exact

  // Pass 2 — word overlap within muscle group
  const hevyMuscle = HEVY_MUSCLE[apiMuscle?.toLowerCase()] ?? null
  const pool = hevyMuscle
    ? templates.filter(t => t.primary_muscle_group === hevyMuscle)
    : templates

  let best = null
  let bestScore = 0.55 // minimum to avoid guessing unrelated exercises
  for (const t of pool) {
    const score = wordOverlap(exerciseName, t.title)
    if (score > bestScore) { bestScore = score; best = t }
  }
  return best
}

/**
 * Resolve a Hevy exercise_template_id for the given exercise.
 * Prefers existing templates (exact or close name match).
 * Only creates a custom template if truly nothing matches.
 * `created` is a per-send cache { normalizedName → id } to avoid duplicates.
 */
export async function resolveHevyTemplateId(apiKey, ex, apiMuscle, templates, created) {
  const existing = findMatchingTemplate(ex.name, apiMuscle, templates)
  if (existing) return String(existing.id)

  const key = normalize(ex.name)
  if (created[key]) return created[key]

  const id = await createHevyExerciseTemplate(apiKey, ex, apiMuscle)
  created[key] = String(id)
  return created[key]
}

function parseScheme(scheme) {
  const m = scheme.match(/(\d+)\s*[×x]\s*(\d+)/)
  if (!m) return [{ reps: 10 }]
  return Array.from({ length: parseInt(m[1]) }, () => ({ reps: parseInt(m[2]) }))
}

export function buildHevyRoutine(exerciseItems, workoutType, title) {
  return {
    title: title || 'Muscle Picasso Workout',
    folder_id: null,
    notes: 'Generated by Muscle Picasso 🎨',
    exercises: exerciseItems.map(({ templateId, scheme }) => ({
      exercise_template_id: templateId,
      superset_id: null,
      rest_seconds: workoutType === 'calisthenics' ? 60 : 90,
      notes: '',
      sets: parseScheme(scheme).map(s => ({
        type: 'normal',
        weight_kg: null,
        reps: s.reps,
        distance_meters: null,
        duration_seconds: null,
        custom_metric: null,
      })),
    })),
  }
}
