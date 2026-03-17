// ─── Exercise config + ExerciseDB API integration ───

const BASE_URL = 'https://exercisedb.dev/api/v1'

// Static metadata per muscle group (label, color, API muscle name)
export const EXERCISES = {
  // Chest
  upper_chest:    { label: 'Upper Chest',     color: '#ff3b5c', apiMuscle: 'pectorals' },
  lower_chest:    { label: 'Lower Chest',     color: '#ff5c3b', apiMuscle: 'pectorals' },
  // Shoulders
  front_delt:     { label: 'Front Delt',      color: '#ff7b3b', apiMuscle: 'delts' },
  side_delt:      { label: 'Side Delt',       color: '#ffa040', apiMuscle: 'delts' },
  rear_delt:      { label: 'Rear Delt',       color: '#ffc060', apiMuscle: 'delts' },
  // Arms
  biceps:         { label: 'Biceps',          color: '#ffb03b', apiMuscle: 'biceps' },
  triceps:        { label: 'Triceps',         color: '#3bff8a', apiMuscle: 'triceps' },
  forearms:       { label: 'Forearms',        color: '#3bffd5', apiMuscle: 'forearms' },
  // Core
  upper_abs:      { label: 'Upper Abs',       color: '#3bb8ff', apiMuscle: 'abs' },
  lower_abs:      { label: 'Lower Abs',       color: '#3bddff', apiMuscle: 'abs' },
  obliques:       { label: 'Obliques',        color: '#5b9fff', apiMuscle: 'abs' },
  // Back
  lats:           { label: 'Lats',            color: '#9b3bff', apiMuscle: 'lats' },
  mid_back:       { label: 'Mid Back',        color: '#6e5bff', apiMuscle: 'upper back' },
  lower_back:     { label: 'Lower Back',      color: '#3b7fff', apiMuscle: 'spine' },
  traps:          { label: 'Traps',           color: '#d43bff', apiMuscle: 'traps' },
  // Glutes
  glute_max:      { label: 'Glutes (Max)',    color: '#ff3bd4', apiMuscle: 'glutes' },
  glute_med:      { label: 'Glutes (Med)',    color: '#ff3baa', apiMuscle: 'glutes' },
  // Legs
  quads:              { label: 'Quadriceps',        color: '#ff5c5c', apiMuscle: 'quads' },
  hamstrings:         { label: 'Hamstrings',        color: '#4ecdc4', apiMuscle: 'hamstrings' },
  adductors:          { label: 'Adductors',         color: '#ff9f3b', apiMuscle: 'adductors' },
  abductors:          { label: 'Abductors',         color: '#ff6b9d', apiMuscle: 'abductors' },
  gastrocnemius:      { label: 'Gastrocnemius',     color: '#45b7d1', apiMuscle: 'calves' },
  soleus:             { label: 'Soleus',            color: '#45c9b5', apiMuscle: 'calves' },
  // Neck / Scapular
  levator_scapulae:   { label: 'Levator Scapulae',  color: '#3bffb8', apiMuscle: 'levator scapulae' },
  // Torso sides
  serratus_anterior:  { label: 'Serratus Anterior', color: '#c8ff3b', apiMuscle: 'serratus anterior' },
}

// ─── Client-side difficulty classifier ───

const ADVANCED_NAMES = [
  'nordic', 'pistol', 'dragon flag', 'planche', 'handstand', 'muscle up',
  'ab wheel', 'rollout', 'snatch', 'clean and jerk', 'l-sit', 'typewriter',
]
const INTERMEDIATE_NAMES = [
  'deadlift', 'squat', 'bench press', 'overhead press', 'pull-up', 'chin-up',
  'barbell row', 'dip', 'clean', 'thruster', 'good morning', 'hip thrust',
  'romanian', 'bulgarian',
]
const BEGINNER_EQUIPMENT = [
  'leverage machine', 'smith machine', 'cable', 'band', 'assisted', 'sled machine',
]

export function classifyDifficulty(exercise) {
  const name = (exercise.name ?? '').toLowerCase()
  const equipment = (exercise.equipments ?? []).map((e) => e.toLowerCase())

  if (ADVANCED_NAMES.some((k) => name.includes(k))) return 'Advanced'
  if (INTERMEDIATE_NAMES.some((k) => name.includes(k))) return 'Intermediate'
  if (equipment.some((e) => BEGINNER_EQUIPMENT.some((b) => e.includes(b)))) return 'Beginner'
  if (equipment.some((e) => e.includes('barbell') || e.includes('kettlebell'))) return 'Intermediate'
  return 'Beginner'
}

// ─── Curated effectiveness map ───
// Keywords in an exercise name that make it highly effective for a given muscle,
// regardless of how the API categorises target/secondary muscles.
export const EFFECTIVE_FOR = {
  upper_chest:   ['incline press', 'incline dumbbell', 'incline fly', 'incline cable', 'low to high', 'incline push'],
  lower_chest:   ['decline press', 'decline fly', 'chest dip', 'dip', 'pec deck', 'cable fly', 'bench press', 'push-up', 'pushup', 'chest press'],
  front_delt:    ['front raise', 'overhead press', 'military press', 'arnold press', 'push press', 'incline press'],
  side_delt:     ['lateral raise', 'cable lateral', 'side raise', 'upright row'],
  rear_delt:     ['face pull', 'reverse fly', 'rear delt', 'reverse cable', 'band pull apart', 'bent over raise', 'reverse pec deck'],
  biceps:        ['curl', 'chin-up', 'hammer'],
  triceps:       ['close-grip', 'skull crusher', 'tricep pushdown', 'overhead extension', 'dip', 'french press'],
  forearms:      ['wrist curl', 'wrist extension', 'farmer', 'reverse curl'],
  upper_abs:     ['crunch', 'cable crunch', 'sit-up', 'situp', 'ab wheel', 'rollout', 'hollow body'],
  lower_abs:     ['leg raise', 'hanging leg', 'reverse crunch', 'dragon flag', 'flutter kick', 'toe touch', 'knee raise'],
  obliques:      ['oblique', 'russian twist', 'side plank', 'bicycle crunch', 'woodchop', 'side bend', 'windshield wiper'],
  lats:          ['pull-up', 'chin-up', 'lat pulldown', 'cable row', 'single arm row', 'straight arm', 'pullover', 'meadows'],
  mid_back:      ['barbell row', 'bent over row', 'face pull', 'reverse fly', 'seated row', 'pendlay', 'rhomboid', 'band pull apart'],
  lower_back:    ['deadlift', 'hyperextension', 'back extension', 'good morning', 'romanian', 'rack pull'],
  traps:         ['shrug', 'face pull', 'upright row', 'deadlift', 'rack pull'],
  glute_max:     ['hip thrust', 'squat', 'deadlift', 'lunge', 'split squat', 'glute bridge', 'sumo', 'step up', 'romanian'],
  glute_med:     ['clamshell', 'side-lying', 'banded walk', 'lateral walk', 'hip abduction', 'fire hydrant', 'monster walk', 'x-band'],
  quads:         ['squat', 'leg press', 'lunge', 'leg extension', 'hack squat', 'bulgarian', 'step up'],
  hamstrings:    ['deadlift', 'romanian', 'leg curl', 'nordic', 'good morning', 'glute-ham', 'sumo'],
  gastrocnemius: ['standing calf', 'donkey calf', 'box jump', 'jump rope', 'single leg calf'],
  soleus:        ['seated calf', 'calf press'],
}

// ─── Movement type + powerbuilding rep scheme ───

const COMPOUND_NAMES = [
  'squat', 'deadlift', 'bench press', 'overhead press', 'military press',
  'barbell row', 'pull-up', 'chin-up', 'dip', 'clean', 'thruster',
  'hip thrust', 'lunge', 'split squat', 'romanian', 'good morning',
  'push press', 'rack pull', 'sumo',
]
const COMPOUND_EQUIPMENT = ['barbell', 'olympic barbell', 'trap bar', 'ez barbell']

export function classifyMovementType(exercise) {
  const name = (exercise.name ?? '').toLowerCase()
  const equipment = (exercise.equipments ?? []).map((e) => e.toLowerCase())
  if (COMPOUND_NAMES.some((k) => name.includes(k))) return 'compound'
  if (COMPOUND_EQUIPMENT.some((e) => equipment.some((eq) => eq.includes(e)))) return 'compound'
  return 'isolation'
}

// Powerbuilding-style scheme: heavy main lift → moderate accessory → pump isolation
export function assignRepScheme(exercise, index) {
  const type = classifyMovementType(exercise)
  if (index === 0) return type === 'compound' ? '5×5' : '4×12'
  if (index === 1) return type === 'compound' ? '4×8' : '3×10'
  return type === 'compound' ? '4×8' : '3×12'
}

// Calisthenics scheme: higher reps, bodyweight progressions
export function assignCalisthenicsRepScheme(exercise, index) {
  const type = classifyMovementType(exercise)
  if (index === 0) return type === 'compound' ? '5×5' : '4×15'
  if (index === 1) return type === 'compound' ? '4×10' : '3×15'
  return type === 'compound' ? '3×10' : '3×20'
}

export function getExerciseRole(exercise, index) {
  const type = classifyMovementType(exercise)
  if (index === 0 && type === 'compound') return 'Main Lift'
  if (type === 'compound') return 'Accessory'
  return 'Isolation'
}

// Fetch exercises for a single muscle group from ExerciseDB API
export async function fetchMuscleExercises(muscleId, limit = 5) {
  const config = EXERCISES[muscleId]
  if (!config) throw new Error(`Unknown muscle: ${muscleId}`)
  const res = await fetch(
    `${BASE_URL}/muscles/${config.apiMuscle}/exercises?limit=${limit}&offset=0`
  )
  if (!res.ok) throw new Error(`API error ${res.status} for ${muscleId}`)
  const json = await res.json()
  return Array.isArray(json) ? json : (json.data ?? [])
}
