import { useState, useRef, useCallback, Suspense } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native'
import { useRouter } from 'expo-router'
import Slider from '@react-native-community/slider'
import { EXERCISES } from '../src/exercises'
import Viewport3D, { type Viewport3DHandle } from '../src/Viewport3D'

export default function PainterScreen() {
  const router = useRouter()
  const viewportRef = useRef<Viewport3DHandle>(null)
  const [paintMode, setPaintMode] = useState<'add' | 'erase'>('add')
  const [brushSize, setBrushSize] = useState(30)
  const [paintedMuscles, setPaintedMuscles] = useState<Set<string>>(new Set())

  const handlePaintStroke = useCallback(() => {
    if (!viewportRef.current) return
    const detected = viewportRef.current.detectMuscles()
    setPaintedMuscles(new Set(detected))
  }, [])

  const handleClear = useCallback(() => {
    viewportRef.current?.clearPaint()
    setPaintedMuscles(new Set())
  }, [])

  const handleViewWorkout = useCallback(() => {
    // Pass muscle ids via router params (serialized as comma-separated string)
    const muscleList = [...paintedMuscles].join(',')
    router.push({ pathname: '/workout', params: { muscles: muscleList } })
  }, [paintedMuscles, router])

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logo}>
            <Text style={styles.logoEmoji}>🎨</Text>
          </View>
          <View>
            <Text style={styles.logoTitle}>Muscle Painter</Text>
            <Text style={styles.logoSub}>3D anatomical model</Text>
          </View>
        </View>
        {paintedMuscles.size > 0 && (
          <TouchableOpacity style={styles.workoutBtn} onPress={handleViewWorkout}>
            <Text style={styles.workoutBtnText}>View Workout ({paintedMuscles.size})</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Main content */}
      <View style={styles.main}>
        {/* 3D Viewport */}
        <View style={styles.viewportContainer}>
          <Suspense fallback={<LoadingOverlay />}>
            <Viewport3D
              ref={viewportRef}
              brushSize={brushSize}
              paintMode={paintMode}
              onPaintStroke={handlePaintStroke}
            />
          </Suspense>
          {/* Hint overlay */}
          <View style={styles.hints} pointerEvents="none">
            <Text style={styles.hintText}>1 finger: Paint  •  2 fingers: Orbit  •  Pinch: Zoom</Text>
          </View>
        </View>

        {/* Sidebar controls */}
        <View style={styles.sidebar}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Brush Mode */}
            <SectionLabel label="Brush Mode" />
            <View style={styles.toggleRow}>
              {[
                { key: 'add' as const, label: '🖌️ Paint', accent: '#ff3b5c' },
                { key: 'erase' as const, label: '🧹 Erase', accent: '#3bb8ff' },
              ].map((m) => (
                <TouchableOpacity
                  key={m.key}
                  onPress={() => setPaintMode(m.key)}
                  style={[
                    styles.toggleBtn,
                    paintMode === m.key && {
                      backgroundColor: m.accent + '18',
                      borderColor: m.accent + '50',
                    },
                  ]}
                >
                  <Text style={[styles.toggleBtnText, { color: paintMode === m.key ? m.accent : '#555' }]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Brush Size */}
            <SectionLabel label={`Brush: ${brushSize}`} />
            <Slider
              style={styles.slider}
              minimumValue={10}
              maximumValue={80}
              value={brushSize}
              onValueChange={(v) => setBrushSize(Math.round(v))}
              minimumTrackTintColor="#ff3b5c"
              maximumTrackTintColor="rgba(255,255,255,0.1)"
              thumbTintColor="#ff3b5c"
            />

            {/* Detected muscles */}
            {paintedMuscles.size > 0 && (
              <>
                <SectionLabel label={`Detected (${paintedMuscles.size})`} />
                <View style={styles.tagWrap}>
                  {[...paintedMuscles].map((id) => {
                    const info = (EXERCISES as any)[id]
                    if (!info) return null
                    return (
                      <View
                        key={id}
                        style={[styles.tag, { backgroundColor: info.color + '20', borderColor: info.color + '40' }]}
                      >
                        <Text style={[styles.tagText, { color: info.color }]}>{info.label}</Text>
                      </View>
                    )
                  })}
                </View>
              </>
            )}

            {/* Actions */}
            {paintedMuscles.size > 0 && (
              <TouchableOpacity style={styles.generateBtn} onPress={handleViewWorkout}>
                <Text style={styles.generateBtnText}>Generate Workout →</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
              <Text style={styles.clearBtnText}>Clear All Paint</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  )
}

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>
}

function LoadingOverlay() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#ff3b5c" />
      <Text style={styles.loadingText}>Loading 3D model…</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#08080f' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
    backgroundColor: 'rgba(8,8,15,0.95)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#ff3b5c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoEmoji: { fontSize: 16 },
  logoTitle: { fontSize: 15, fontWeight: '800', color: '#fff' },
  logoSub: { fontSize: 9, color: '#444', letterSpacing: 1.5, textTransform: 'uppercase' },
  workoutBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#ff3b5c',
  },
  workoutBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  main: { flex: 1, flexDirection: 'row' },
  viewportContainer: { flex: 1, position: 'relative' },
  hints: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hintText: {
    fontSize: 10,
    color: '#444',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
  },
  sidebar: {
    width: 200,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.04)',
    backgroundColor: 'rgba(6,6,12,0.7)',
    padding: 12,
  },
  sectionLabel: {
    fontSize: 9,
    color: '#444',
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 12,
  },
  toggleRow: { flexDirection: 'row', gap: 4 },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  toggleBtnText: { fontSize: 11, fontWeight: '600' },
  slider: { width: '100%', height: 36 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  tagText: { fontSize: 9, fontWeight: '600' },
  generateBtn: {
    marginTop: 14,
    padding: 11,
    borderRadius: 8,
    backgroundColor: '#ff3b5c',
    alignItems: 'center',
  },
  generateBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  clearBtn: {
    marginTop: 8,
    padding: 9,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  clearBtnText: { color: '#555', fontSize: 10 },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,8,15,0.95)',
  },
  loadingText: { marginTop: 16, fontSize: 13, color: '#888' },
})
