import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { PaintEngine } from './PaintEngine'
import { createPaintMaterial } from './paintShader'

/**
 * Inner component that loads the GLB, sets up the paint shader,
 * and handles raycasting + painting on pointer events.
 */
function BodyModel({ modelPath, paintEngine, brushActive, onPaintStroke }) {
  const gltf = useGLTF(modelPath)
  const meshRef = useRef(null)
  const raycaster = useRef(new THREE.Raycaster())
  const pointer = useRef(new THREE.Vector2())
  const { camera, gl } = useThree()

  // Find and set up the body mesh with our paint shader
  useEffect(() => {
    if (!gltf.scene) return

    let bodyMesh = null

    // Find the biggest mesh (the body)
    let maxVerts = 0
    gltf.scene.traverse((child) => {
      if (child.isMesh) {
        const count = child.geometry.attributes.position?.count || 0
        if (count > maxVerts) {
          maxVerts = count
          bodyMesh = child
        }
      }
    })

    if (bodyMesh) {
      meshRef.current = bodyMesh

      // Swap material for our paint shader
      const origMap = bodyMesh.material.map
      const origNormal = bodyMesh.material.normalMap
      bodyMesh.material = createPaintMaterial(origMap, paintEngine.texture, origNormal)
    }
  }, [gltf, paintEngine])

  // Throttle state updates so React re-renders don't happen on every mousemove
  const lastNotifyRef = useRef(0)

  // Raycast paint helper
  const doPaint = useCallback(
    (clientX, clientY) => {
      if (!meshRef.current) return

      const rect = gl.domElement.getBoundingClientRect()
      pointer.current.x = ((clientX - rect.left) / rect.width) * 2 - 1
      pointer.current.y = -((clientY - rect.top) / rect.height) * 2 + 1

      raycaster.current.setFromCamera(pointer.current, camera)
      const hits = raycaster.current.intersectObject(meshRef.current, false)

      if (hits.length > 0 && hits[0].uv) {
        paintEngine.paintAtUV(hits[0].uv, hits[0].point)
        // Only notify parent ~10×/sec to avoid re-rendering on every mousemove
        const now = Date.now()
        if (now - lastNotifyRef.current > 100) {
          lastNotifyRef.current = now
          onPaintStroke?.()
        }
      }
    },
    [camera, gl, paintEngine, onPaintStroke]
  )

  // Pointer event handlers on the canvas
  useEffect(() => {
    const canvas = gl.domElement
    let painting = false

    const onDown = (e) => {
      // Only paint on left-click without modifier keys
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (!brushActive.current) return
      painting = true
      doPaint(e.clientX, e.clientY)
    }

    const onMove = (e) => {
      if (!painting || !brushActive.current) return
      doPaint(e.clientX, e.clientY)
    }

    const onUp = () => {
      painting = false
    }

    // Touch support
    const onTouchStart = (e) => {
      if (e.touches.length !== 1 || !brushActive.current) return
      painting = true
      const t = e.touches[0]
      doPaint(t.clientX, t.clientY)
    }

    const onTouchMove = (e) => {
      if (!painting || e.touches.length !== 1 || !brushActive.current) return
      const t = e.touches[0]
      doPaint(t.clientX, t.clientY)
    }

    const onTouchEnd = () => {
      painting = false
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointerleave', onUp)
    canvas.addEventListener('touchstart', onTouchStart, { passive: true })
    canvas.addEventListener('touchmove', onTouchMove, { passive: true })
    canvas.addEventListener('touchend', onTouchEnd)

    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointerleave', onUp)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
    }
  }, [gl, doPaint, brushActive])

  // Auto-center and scale
  useEffect(() => {
    if (!gltf.scene) return
    const box = new THREE.Box3().setFromObject(gltf.scene)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const scale = 2.2 / maxDim
    gltf.scene.scale.setScalar(scale)
    gltf.scene.position.set(
      -center.x * scale,
      -center.y * scale + size.y * scale * 0.5,
      -center.z * scale
    )
  }, [gltf])

  return <primitive object={gltf.scene} />
}

/**
 * Configures orbit controls so left-drag orbits only when
 * Ctrl/right-click is held (otherwise left-drag paints).
 */
function SmartOrbitControls({ brushActive }) {
  const controlsRef = useRef()
  const { gl } = useThree()

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return

    // By default, enable orbit on right mouse + middle mouse
    controls.mouseButtons = {
      LEFT: null, // We'll toggle this dynamically
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    }
    controls.touches = {
      ONE: null,
      TWO: THREE.TOUCH.DOLLY_ROTATE,
    }
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.target.set(0, 1.0, 0)
    controls.minDistance = 0.5
    controls.maxDistance = 5
    controls.update()

    // When ctrl/meta is held, enable left-button orbit
    const onKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
        controls.touches.ONE = THREE.TOUCH.ROTATE
        brushActive.current = false
      }
    }
    const onKeyUp = () => {
      controls.mouseButtons.LEFT = null
      controls.touches.ONE = null
      brushActive.current = true
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [brushActive])

  useFrame(() => {
    controlsRef.current?.update()
  })

  return <OrbitControls ref={controlsRef} args={[undefined, gl.domElement]} />
}

/**
 * The main 3D viewport component.
 * Exposes clearPaint() and detectMuscles() via ref.
 */
const Viewport3D = forwardRef(function Viewport3D(
  { brushSize, paintMode, onPaintStroke },
  ref
) {
  const paintEngineRef = useRef(null)
  const brushActiveRef = useRef(true)

  // Create paint engine once
  if (!paintEngineRef.current) {
    paintEngineRef.current = new PaintEngine()
  }

  const paintEngine = paintEngineRef.current

  // Keep paint engine in sync with props
  useEffect(() => {
    paintEngine.brushSize = brushSize
  }, [brushSize, paintEngine])

  useEffect(() => {
    paintEngine.mode = paintMode
  }, [paintMode, paintEngine])

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    clearPaint: () => paintEngine.clear(),
    detectMuscles: () => new Set(paintEngine.detectedMuscles),
  }))

  return (
    <Canvas
      camera={{ position: [0, 1.0, 2.5], fov: 40, near: 0.01, far: 100 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.3 }}
      style={{ background: '#08080f' }}
    >
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 5, 3]} intensity={1.0} />
      <directionalLight position={[-3, 2, -2]} intensity={0.35} color="#8899cc" />
      <directionalLight position={[0, -1, -3]} intensity={0.2} color="#ff6644" />

      {/* Ground grid */}
      <gridHelper args={[4, 20, '#151520', '#0d0d18']} position={[0, -0.05, 0]} />

      {/* The body model + painting */}
      <BodyModel
        modelPath="/male_base_muscular_anatomy.glb"
        paintEngine={paintEngine}
        brushActive={brushActiveRef}
        onPaintStroke={onPaintStroke}
      />

      {/* Orbit: right-drag or Ctrl+left-drag */}
      <SmartOrbitControls brushActive={brushActiveRef} />
    </Canvas>
  )
})

export default Viewport3D
