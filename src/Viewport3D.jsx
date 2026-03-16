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
function BodyModel({ modelPath, paintEngine, brushActive, orbitControlsRef, onPaintStroke }) {
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

  // Raycast and apply paint/erase with the given mode override
  const doPaint = useCallback(
    (clientX, clientY, modeOverride) => {
      if (!meshRef.current) return

      const rect = gl.domElement.getBoundingClientRect()
      pointer.current.x = ((clientX - rect.left) / rect.width) * 2 - 1
      pointer.current.y = -((clientY - rect.top) / rect.height) * 2 + 1

      raycaster.current.setFromCamera(pointer.current, camera)
      const hits = raycaster.current.intersectObject(meshRef.current, false)

      if (hits.length > 0 && hits[0].uv) {
        const prevMode = paintEngine.mode
        if (modeOverride) paintEngine.mode = modeOverride
        paintEngine.paintAtUV(hits[0].uv, hits[0].point)
        paintEngine.mode = prevMode
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
    let erasing = false
    let lastX = null
    let lastY = null

    const doPaintInterpolated = (x, y, mode) => {
      if (lastX === null) {
        doPaint(x, y, mode)
      } else {
        const dx = x - lastX
        const dy = y - lastY
        const dist = Math.sqrt(dx * dx + dy * dy)
        // Step every ~4px so strokes stay solid even when dragging fast
        const step = Math.max(4, paintEngine.brushSize * 0.15)
        const steps = Math.max(1, Math.ceil(dist / step))
        for (let i = 1; i <= steps; i++) {
          doPaint(lastX + dx * (i / steps), lastY + dy * (i / steps), mode)
        }
      }
      lastX = x
      lastY = y
    }

    const resetStroke = () => { lastX = null; lastY = null }

    // Capture-phase handler for right-click: runs before OrbitControls sees the event.
    // If right-clicking on paint → disable right-orbit and erase instead.
    // If right-clicking elsewhere → leave right-orbit enabled.
    const onDownCapture = (e) => {
      if (e.button !== 2) return
      const controls = orbitControlsRef.current
      if (!controls || !meshRef.current) return

      const rect = canvas.getBoundingClientRect()
      pointer.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.current.setFromCamera(pointer.current, camera)
      const hits = raycaster.current.intersectObject(meshRef.current, false)

      if (hits.length > 0) {
        // On model — block orbit, handle as erase
        controls.mouseButtons.RIGHT = null
        erasing = true
        doPaintInterpolated(e.clientX, e.clientY, 'erase')
      } else {
        // Off model — allow orbit
        controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE
      }
    }

    const onDown = (e) => {
      // Only paint on left-click without modifier keys
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (!brushActive.current) return
      painting = true
      doPaintInterpolated(e.clientX, e.clientY, null)
    }

    const onMove = (e) => {
      if (!brushActive.current) return
      if (painting && e.buttons === 1) doPaintInterpolated(e.clientX, e.clientY, null)
      if (erasing && e.buttons === 2) doPaintInterpolated(e.clientX, e.clientY, 'erase')
    }

    const onUp = (e) => {
      if (e.button === 0) { painting = false; resetStroke() }
      if (e.button === 2) {
        erasing = false
        resetStroke()
        // Restore right-click orbit
        if (orbitControlsRef.current) orbitControlsRef.current.mouseButtons.RIGHT = THREE.MOUSE.ROTATE
      }
    }

    const onContextMenu = (e) => e.preventDefault()

    // Touch support
    const onTouchStart = (e) => {
      if (e.touches.length !== 1 || !brushActive.current) return
      painting = true
      const t = e.touches[0]
      doPaintInterpolated(t.clientX, t.clientY, null)
    }

    const onTouchMove = (e) => {
      if (!painting || e.touches.length !== 1 || !brushActive.current) return
      const t = e.touches[0]
      doPaintInterpolated(t.clientX, t.clientY, null)
    }

    const onTouchEnd = () => {
      painting = false
      resetStroke()
    }

    canvas.addEventListener('pointerdown', onDownCapture, { capture: true })
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    const onLeave = () => { painting = false; erasing = false; resetStroke() }

    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('contextmenu', onContextMenu)
    canvas.addEventListener('touchstart', onTouchStart, { passive: true })
    canvas.addEventListener('touchmove', onTouchMove, { passive: true })
    canvas.addEventListener('touchend', onTouchEnd)

    return () => {
      canvas.removeEventListener('pointerdown', onDownCapture, { capture: true })
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('contextmenu', onContextMenu)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
    }
  }, [gl, camera, doPaint, brushActive, orbitControlsRef, paintEngine])

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
 * Configures orbit controls. Right-drag orbits by default; BodyModel's capture
 * handler overrides this when right-clicking on paint.
 */
function SmartOrbitControls({ brushActive, controlsRef }) {
  const { gl } = useThree()

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return

    controls.mouseButtons = {
      LEFT: null,
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
  }, [brushActive, controlsRef])

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
  const orbitControlsRef = useRef(null)

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
        modelPath={`${import.meta.env.BASE_URL}male_base_muscular_anatomy.glb`}
        paintEngine={paintEngine}
        brushActive={brushActiveRef}
        orbitControlsRef={orbitControlsRef}
        onPaintStroke={onPaintStroke}
      />

      {/* Orbit: right-drag (unpainted areas) or Ctrl+left-drag */}
      <SmartOrbitControls brushActive={brushActiveRef} controlsRef={orbitControlsRef} />
    </Canvas>
  )
})

export default Viewport3D
