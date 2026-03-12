import { EXERCISES } from './exercises'

export default function WorkoutPanel({ paintedMuscles, onBack }) {
  const workout = [...paintedMuscles]
    .filter((id) => EXERCISES[id])
    .map((id) => ({ id, ...EXERCISES[id] }))

  const totalExercises = workout.reduce((s, g) => s + g.exercises.length, 0)

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <button onClick={onBack} style={styles.backBtn}>
          ← Back to Model
        </button>

        <h2 style={styles.title}>Your Painted Workout</h2>
        <p style={styles.subtitle}>
          Targeting {paintedMuscles.size} muscle group
          {paintedMuscles.size !== 1 ? 's' : ''} · {totalExercises} exercises
        </p>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
          {[
            { label: 'Muscles', value: paintedMuscles.size, color: '#ff3b5c' },
            { label: 'Exercises', value: totalExercises, color: '#ff7b3b' },
            { label: 'Est. Time', value: `${totalExercises * 5}min`, color: '#3bb8ff' },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                background: `${s.color}10`,
                border: `1px solid ${s.color}20`,
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Exercise cards */}
        {workout.map((group) => (
          <div key={group.id} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: group.color,
                  boxShadow: `0 0 8px ${group.color}40`,
                }}
              />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#fff' }}>
                {group.label}
              </h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {group.exercises.map((ex, i) => (
                <div key={i} style={{ ...styles.card, borderLeft: `3px solid ${group.color}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#eee' }}>{ex.name}</div>
                    <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                      {ex.diff === 'Beg' ? 'Beginner' : ex.diff === 'Int' ? 'Intermediate' : 'Advanced'}
                    </div>
                  </div>
                  <div style={styles.sets}>{ex.sets}</div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Tips */}
        <div style={styles.tips}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#ff7b3b', marginBottom: 8, letterSpacing: 1 }}>
            💡 TRAINING TIPS
          </div>
          <div style={{ fontSize: 12, color: '#555', lineHeight: 2 }}>
            Warm up 5-10 minutes before starting<br />
            Rest 60-90s between hypertrophy sets<br />
            Track your weights for progressive overload<br />
            Train each muscle group 2× per week for optimal growth
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    background: 'rgba(255,255,255,0.06)',
    border: 'none',
    borderRadius: 8,
    color: '#888',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 900,
    margin: '0 0 6px',
    background: 'linear-gradient(135deg, #ff3b5c, #ff7b3b, #ffb03b)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: {
    fontSize: 13,
    color: '#555',
    margin: '0 0 20px',
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '12px 16px',
    borderRadius: 10,
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.04)',
  },
  sets: {
    padding: '5px 12px',
    borderRadius: 6,
    background: 'rgba(255,255,255,0.04)',
    fontSize: 13,
    fontWeight: 700,
    color: '#bbb',
    fontFamily: "'DM Mono', monospace",
  },
  tips: {
    marginTop: 24,
    padding: 20,
    borderRadius: 12,
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.04)',
  },
}
