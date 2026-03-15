import { SafeAreaView, StyleSheet } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import WorkoutPanel from '../src/WorkoutPanel'

export default function WorkoutScreen() {
  const { muscles } = useLocalSearchParams<{ muscles: string }>()
  const router = useRouter()

  const paintedMuscles = new Set(
    muscles ? muscles.split(',').filter(Boolean) : []
  )

  return (
    <SafeAreaView style={styles.root}>
      <WorkoutPanel
        paintedMuscles={paintedMuscles}
        onBack={() => router.back()}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#08080f' },
})
