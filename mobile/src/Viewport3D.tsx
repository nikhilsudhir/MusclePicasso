import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle, Suspense } from 'react'
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native'
import { Canvas, useThree, useFrame } from '@react-three/fiber/native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import * as THREE from 'three'
import { Asset } from 'expo-asset'
import * as FileSystem from 'expo-file-system/legacy'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { PaintEngine } from './PaintEngine'
import { createPaintMaterial } from './paintShader'

// GLB asset reference
const MODEL_ASSET = require('../assets/male_base_muscular_anatomy.glb')

function useGLBModel(paintEngine: PaintEngine) {
  const { scene } = useThree()
  const meshRef = useRef<THREE.Mesh | null>(null)
  const modelRef = useRef<THREE.Group | null>(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true

    ;(async () => {
      const [asset] = await Asset.loadAsync(MODEL_ASSET)
      const uri = asset.localUri ?? asset.uri
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      })
      const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))

      const loader = new GLTFLoader()
      loader.parse(binary.buffer as ArrayBuffer, '', (gltf) => {
        const group = gltf.scene

        // Auto-center and scale to ~2.2 units tall
        const box = new THREE.Box3().setFromObject(group)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)
        const scale = 2.2 / maxDim
        group.scale.setScalar(scale)
        group.position.set(
          -center.x * scale,
          -center.y * scale + size.y * scale * 0.5,
          -center.z * scale
        )

        // Find the body mesh (biggest by vertex count)
        let bodyMesh: THREE.Mesh | null = null
        let maxVerts = 0
        group.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh
            const count = mesh.geometry.attributes.position?.count ?? 0
            if (count > maxVerts) {
              maxVerts = count
              bodyMesh = mesh
            }
          }
        })

        if (bodyMesh) {
          const mesh = bodyMesh as THREE.Mesh
          meshRef.current = mesh
          const mat = mesh.material as THREE.MeshStandardMaterial
          mesh.material = createPaintMaterial(
            mat.map ?? null,
            paintEngine.texture,
            mat.normalMap ?? null
          )
        }

        scene.add(group)
        modelRef.current = group
      })
    })()
  }, [scene, paintEngine])

  return meshRef
}

interface BodySceneProps {
  paintEngine: PaintEngine
  onPaintStroke: () => void
}

function BodyScene({ paintEngine, onPaintStroke }: BodySceneProps) {
  const { camera, gl } = useThree()
  const meshRef = useGLBModel(paintEngine)
  const raycaster = useRef(new THREE.Raycaster())
  const lastNotifyRef = useRef(0)

  // Orbit state
  const orbitState = useRef({
    isOrbiting: false,
    prevAngle: 0,
    azimuth: 0.3,
    elevation: 0.2,
    distance: 2.5,
    target: new THREE.Vector3(0, 1.0, 0),
  })

  const doPaint = useCallback(
    (nx: number, ny: number) => {
      if (!meshRef.current) return
      // nx, ny are normalized device coordinates [-1, 1]
      const pointer = new THREE.Vector2(nx, ny)
      raycaster.current.setFromCamera(pointer, camera)
      const hits = raycaster.current.intersectObject(meshRef.current, false)
      if (hits.length > 0 && hits[0].uv) {
        paintEngine.paintAtUV(hits[0].uv, hits[0].point)
        const now = Date.now()
        if (now - lastNotifyRef.current > 80) {
          lastNotifyRef.current = now
          onPaintStroke()
        }
      }
    },
    [camera, paintEngine, onPaintStroke, meshRef]
  )

  // Update camera from orbit state each frame
  useFrame(() => {
    const { azimuth, elevation, distance, target } = orbitState.current
    const x = target.x + distance * Math.cos(elevation) * Math.sin(azimuth)
    const y = target.y + distance * Math.sin(elevation)
    const z = target.z + distance * Math.cos(elevation) * Math.cos(azimuth)
    camera.position.set(x, y, z)
    camera.lookAt(target)
  })

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 5, 3]} intensity={1.0} />
      <directionalLight position={[-3, 2, -2]} intensity={0.35} color="#8899cc" />
      <directionalLight position={[0, -1, -3]} intensity={0.2} color="#ff6644" />
      <gridHelper args={[4, 20, '#151520', '#0d0d18']} position={[0, -0.05, 0]} />
    </>
  )
}

export interface Viewport3DHandle {
  clearPaint: () => void
  detectMuscles: () => Set<string>
  paintAt: (nx: number, ny: number) => void
  orbit: (deltaAzimuth: number, deltaElevation: number) => void
  zoom: (delta: number) => void
}

interface Viewport3DProps {
  brushSize: number
  paintMode: 'add' | 'erase'
  onPaintStroke: () => void
}

const Viewport3D = forwardRef<Viewport3DHandle, Viewport3DProps>(function Viewport3D(
  { brushSize, paintMode, onPaintStroke },
  ref
) {
  const paintEngineRef = useRef<PaintEngine | null>(null)
  if (!paintEngineRef.current) {
    paintEngineRef.current = new PaintEngine()
  }
  const paintEngine = paintEngineRef.current
  // Internal refs for gesture → R3F communication
  const orbitStateRef = useRef({
    azimuth: 0.3,
    elevation: 0.2,
    distance: 2.5,
  })
  const paintFnRef = useRef<((nx: number, ny: number) => void) | null>(null)
  const canvasLayoutRef = useRef({ width: 1, height: 1 })

  useEffect(() => {
    paintEngine.brushSize = brushSize
  }, [brushSize, paintEngine])

  useEffect(() => {
    paintEngine.mode = paintMode
  }, [paintMode, paintEngine])

  useImperativeHandle(ref, () => ({
    clearPaint: () => paintEngine.clear(),
    detectMuscles: () => new Set(paintEngine.detectedMuscles),
    paintAt: (nx, ny) => paintFnRef.current?.(nx, ny),
    orbit: (dAz, dEl) => {
      orbitStateRef.current.azimuth += dAz
      orbitStateRef.current.elevation = Math.max(
        -Math.PI / 2.5,
        Math.min(Math.PI / 2.5, orbitStateRef.current.elevation + dEl)
      )
    },
    zoom: (delta) => {
      orbitStateRef.current.distance = Math.max(
        0.5,
        Math.min(6, orbitStateRef.current.distance + delta)
      )
    },
  }))

  // Gesture: single finger paint, two finger orbit/pinch
  const paintingRef = useRef(false)
  const orbitingRef = useRef(false)
  const lastPointerRef = useRef({ x: 0, y: 0 })
  const lastPinchDist = useRef(0)

  const tapGesture = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e) => {
      const { width, height } = canvasLayoutRef.current
      const nx = (e.x / width) * 2 - 1
      const ny = -((e.y / height) * 2 - 1)
      paintFnRef.current?.(nx, ny)
    })

  const panGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .runOnJS(true)
    .onBegin((e) => {
      paintingRef.current = true
      lastPointerRef.current = { x: e.x, y: e.y }
      const { width, height } = canvasLayoutRef.current
      const nx = (e.x / width) * 2 - 1
      const ny = -((e.y / height) * 2 - 1)
      paintFnRef.current?.(nx, ny)
    })
    .onUpdate((e) => {
      if (!paintingRef.current) return
      const { width, height } = canvasLayoutRef.current
      const nx = (e.x / width) * 2 - 1
      const ny = -((e.y / height) * 2 - 1)
      paintFnRef.current?.(nx, ny)
    })
    .onEnd(() => {
      paintingRef.current = false
    })

  const twoFingerPan = Gesture.Pan()
    .minPointers(2)
    .maxPointers(2)
    .runOnJS(true)
    .onBegin((e) => {
      orbitingRef.current = true
      lastPointerRef.current = { x: e.x, y: e.y }
    })
    .onUpdate((e) => {
      if (!orbitingRef.current) return
      const dx = e.x - lastPointerRef.current.x
      const dy = e.y - lastPointerRef.current.y
      orbitStateRef.current.azimuth += dx * 0.005
      orbitStateRef.current.elevation = Math.max(
        -Math.PI / 2.5,
        Math.min(Math.PI / 2.5, orbitStateRef.current.elevation - dy * 0.005)
      )
      lastPointerRef.current = { x: e.x, y: e.y }
    })
    .onEnd(() => {
      orbitingRef.current = false
    })

  const pinchGesture = Gesture.Pinch()
    .runOnJS(true)
    .onUpdate((e) => {
      orbitStateRef.current.distance = Math.max(
        0.5,
        Math.min(6, orbitStateRef.current.distance / e.scale)
      )
    })

  const composed = Gesture.Simultaneous(
    Gesture.Race(panGesture, twoFingerPan),
    pinchGesture
  )

  return (
    <GestureDetector gesture={composed}>
      <View
        style={styles.container}
        onLayout={(e) => {
          canvasLayoutRef.current = {
            width: e.nativeEvent.layout.width,
            height: e.nativeEvent.layout.height,
          }
        }}
      >
        <Canvas
          style={styles.canvas}
          camera={{ position: [0, 1.0, 2.5], fov: 40, near: 0.01, far: 100 }}
          gl={{ antialias: true }}
          onCreated={({ gl }) => {
            gl.setClearColor(new THREE.Color('#08080f'))
          }}
        >
          <BodySceneInner
            paintEngine={paintEngine}
            orbitStateRef={orbitStateRef}
            paintFnRef={paintFnRef}
            onPaintStroke={onPaintStroke}
          />
        </Canvas>
      </View>
    </GestureDetector>
  )
})

export default Viewport3D

// Inner R3F component that has access to Three.js context
interface BodySceneInnerProps {
  paintEngine: PaintEngine
  orbitStateRef: React.MutableRefObject<{ azimuth: number; elevation: number; distance: number }>
  paintFnRef: React.MutableRefObject<((nx: number, ny: number) => void) | null>
  onPaintStroke: () => void
}

function BodySceneInner({ paintEngine, orbitStateRef, paintFnRef, onPaintStroke }: BodySceneInnerProps) {
  const { camera } = useThree()
  const meshRef = useGLBModel(paintEngine)
  const raycaster = useRef(new THREE.Raycaster())
  const lastNotifyRef = useRef(0)
  const target = useRef(new THREE.Vector3(0, 1.0, 0))

  // Expose paint function to gesture handlers
  useEffect(() => {
    paintFnRef.current = (nx: number, ny: number) => {
      if (!meshRef.current) return
      raycaster.current.setFromCamera(new THREE.Vector2(nx, ny), camera)
      const hits = raycaster.current.intersectObject(meshRef.current, false)
      if (hits.length > 0 && hits[0].uv) {
        paintEngine.paintAtUV(hits[0].uv, hits[0].point)
        const now = Date.now()
        if (now - lastNotifyRef.current > 80) {
          lastNotifyRef.current = now
          onPaintStroke()
        }
      }
    }
  }, [camera, meshRef, paintEngine, onPaintStroke, paintFnRef])

  useFrame(() => {
    const { azimuth, elevation, distance } = orbitStateRef.current
    const t = target.current
    camera.position.set(
      t.x + distance * Math.cos(elevation) * Math.sin(azimuth),
      t.y + distance * Math.sin(elevation),
      t.z + distance * Math.cos(elevation) * Math.cos(azimuth)
    )
    camera.lookAt(t)
  })

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 5, 3]} intensity={1.0} />
      <directionalLight position={[-3, 2, -2]} intensity={0.35} color="#8899cc" />
      <directionalLight position={[0, -1, -3]} intensity={0.2} color="#ff6644" />
      <gridHelper args={[4, 20, '#151520', '#0d0d18']} position={[0, -0.05, 0] as [number, number, number]} />
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#08080f' },
  canvas: { flex: 1 },
})
