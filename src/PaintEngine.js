import * as THREE from 'three'

const PAINT_COLOR = '#ff5c7a'

/**
 * PaintEngine manages the 2048×2048 canvas texture overlaid on the 3D model.
 * Muscle detection is based on the 3D world position of each stroke, not color.
 */
export class PaintEngine {
  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.width = 2048
    this.canvas.height = 2048
    this.ctx = this.canvas.getContext('2d')
    this.ctx.clearRect(0, 0, 2048, 2048)

    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.flipY = false
    this.texture.colorSpace = THREE.SRGBColorSpace

    this.brushSize = 30
    this.mode = 'add' // 'add' | 'erase'
    this._detectedMuscles = new Set()
    this._muscleUVs = {} // muscleId -> [{x, y}] UV samples painted for that muscle
  }

  get detectedMuscles() {
    return this._detectedMuscles
  }

  hasPaintAtUV(uv) {
    const px = Math.min(2047, Math.floor(uv.x * 2048))
    const py = Math.min(2047, Math.floor(uv.y * 2048))
    return this.ctx.getImageData(px, py, 1, 1).data[3] > 10
  }

  /**
   * Paint a soft brush stroke at a UV coordinate (0–1) and detect the muscle
   * from the 3D world hit point.
   */
  paintAtUV(uv, worldPoint, worldNormal) {
    if (!uv) return

    const x = uv.x * 2048
    const y = uv.y * 2048

    const ctx = this.ctx

    if (this.mode === 'erase') {
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.arc(x, y, this.brushSize * 1.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      this._recomputeDetectedMuscles()
    } else {
      ctx.save()
      ctx.globalCompositeOperation = 'source-over'
      const grad = ctx.createRadialGradient(x, y, 0, x, y, this.brushSize)
      grad.addColorStop(0, PAINT_COLOR + 'cc')
      grad.addColorStop(0.5, PAINT_COLOR + '88')
      grad.addColorStop(1, PAINT_COLOR + '00')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(x, y, this.brushSize, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      if (worldPoint) {
        const muscle = detectMuscleFromPoint(worldPoint, worldNormal)
        if (muscle) {
          this._detectedMuscles.add(muscle)
          if (!this._muscleUVs[muscle]) this._muscleUVs[muscle] = []
          this._muscleUVs[muscle].push({ x: uv.x, y: uv.y })
        }
      }
    }

    this.texture.needsUpdate = true
  }

  /**
   * Clear all paint and reset detected muscles.
   */
  clear() {
    this.ctx.clearRect(0, 0, 2048, 2048)
    this.texture.needsUpdate = true
    this._detectedMuscles = new Set()
    this._muscleUVs = {}
  }

  /**
   * Re-derive the detected set by sampling the canvas at the UV coordinates
   * that were painted for each muscle. A muscle is removed when all of its
   * stored UV samples have been fully erased (alpha < 10).
   */
  _recomputeDetectedMuscles() {
    const newDetected = new Set()
    for (const [muscle, uvs] of Object.entries(this._muscleUVs)) {
      for (const uv of uvs) {
        const px = Math.min(2047, Math.floor(uv.x * 2048))
        const py = Math.min(2047, Math.floor(uv.y * 2048))
        const pixel = this.ctx.getImageData(px, py, 1, 1).data
        if (pixel[3] > 10) {
          newDetected.add(muscle)
          break
        }
      }
    }
    this._detectedMuscles = newDetected
  }
}

/**
 * Map a 3D world-space hit point to a muscle group key.
 *
 * All thresholds are derived from physical calibration of this specific model
 * (male_base_muscular_anatomy.glb, scaled to ~2.2 units tall).
 *
 * Features per hit point:
 *   y       — height (0 = feet, 2.2 = head)
 *   absX    — |x|, lateral distance from body midline
 *   nz      — surface normal z-component (+1 = faces viewer/front, -1 = faces back)
 *   ny      — surface normal y-component (+1 = faces up, -1 = faces down)
 *   outward — nx * sign(x): normal component pointing away from midline on each side
 */
function detectMuscleFromPoint(point, normal) {
  const { x, y } = point
  const absX = Math.abs(x)
  const nx = normal?.x ?? 0
  const ny = normal?.y ?? 0
  const nz = normal?.z ?? 0
  const outward = nx * Math.sign(x || 1)

  // Head and neck: no paintable muscle
  if (y > 1.88) return null

  // ── ARMS (T-pose: y 1.44–1.62, absX > 0.19) ──
  // Key calibration finding: biceps face FORWARD (nz 0.18–0.92), not upward.
  // Triceps face BACKWARD (nz -1.00 to -0.75). Deltoids at y 1.54–1.62, absX 0.20–0.35.
  if (absX > 0.19 && y > 1.44 && y < 1.62) {
    // Forearms: unambiguous — outermost absX (0.53–0.86)
    if (absX > 0.52) return 'forearms'
    // Triceps: strongly posterior face (nz -1.00 to -0.75)
    if (nz < -0.70) return 'triceps'
    // Biceps: forward-facing, past deltoid into upper-arm zone (absX > 0.32, nz > 0.15)
    if (absX > 0.32 && nz > 0.15) return 'biceps'
    // Deltoid cap (absX 0.20–0.35, y 1.54–1.62)
    if (nz > 0.50) return 'front_delt'
    if (nz < -0.20) return 'rear_delt'
    return 'side_delt'  // top-facing shoulder cap (ny ≈ 0.95)
  }

  // ── LEVATOR SCAPULAE (lateral neck, y 1.62–1.72) ──
  // Must be checked before traps; requires lateral outward normal.
  if (y > 1.62 && y < 1.73 && absX > 0.05 && absX < 0.18 && outward > 0.10) return 'levator_scapulae'

  // ── MID BACK (central spine, y 1.33–1.63) ──
  // Very tight absX < 0.06; must precede traps to avoid being absorbed.
  if (y > 1.33 && y < 1.63 && absX < 0.06 && nz < -0.40) return 'mid_back'

  // ── TRAPS (posterior upper back, y 1.33–1.72, absX < 0.18) ──
  if (y > 1.33 && y < 1.73 && absX < 0.18 && nz < -0.08) return 'traps'

  // ── CHEST ──
  // Upper chest: y 1.49–1.57, nz > 0.60 (forward-and-upward face)
  if (y > 1.49 && y < 1.57 && nz > 0.60 && absX < 0.23) return 'upper_chest'
  // Lower chest: y 1.37–1.47, nz > 0.54
  if (y > 1.37 && y < 1.47 && nz > 0.54 && absX < 0.22) return 'lower_chest'

  // ── LATERAL TORSO (outward > 0.50) ──
  // Serratus anterior and obliques share the lateral ribcage/waist surface.
  // Both calibrated with outward 0.52–0.98; split by y (serratus higher, obliques lower).
  if (outward > 0.50 && absX > 0.14 && y > 1.20 && y < 1.42) {
    return y > 1.28 ? 'serratus_anterior' : 'obliques'
  }

  // ── LATS (posterior lateral back, y 1.15–1.51) ──
  // outward > 0.30 separates from central back muscles.
  if (y > 1.15 && y < 1.52 && nz < -0.25 && absX > 0.12 && outward > 0.30) return 'lats'

  // ── LOWER BACK (y 1.14–1.22, posterior) ──
  if (y > 1.14 && y < 1.23 && nz < -0.24) return 'lower_back'

  // ── ABS ──
  // Upper abs: narrow band y 1.30–1.35, nz > 0.40
  if (y > 1.30 && y < 1.35 && nz > 0.40 && absX < 0.16) return 'upper_abs'
  // Lower abs: y 1.09–1.27, nz > 0.48
  if (y > 1.09 && y < 1.27 && nz > 0.48 && absX < 0.12) return 'lower_abs'

  // ── GLUTES ──
  // Glute med: upper-outer glute, more upward-tilted face (ny > 0.14), y 1.08–1.16
  if (y > 1.08 && y < 1.16 && nz < -0.35 && ny > 0.14) return 'glute_med'
  // Glute max: main posterior mass, y 0.93–1.15
  if (y > 0.93 && y < 1.15 && nz < -0.28) return 'glute_max'

  // ── HIPS / UPPER THIGH ──
  // Abductors: strongly outward-facing lateral hip, y 0.81–1.12
  if (y > 0.81 && y < 1.12 && absX > 0.14 && outward > 0.20) return 'abductors'
  // Adductors: strongly inward-facing inner thigh (outward -0.99 to -0.67), y 0.70–0.90
  if (y > 0.70 && y < 0.91 && outward < -0.65) return 'adductors'

  // ── THIGH ──
  // Quads: forward-facing anterior thigh, y 0.60–1.04
  if (y > 0.60 && y < 1.05 && nz > 0.28) return 'quads'
  // Hamstrings: posterior thigh, y 0.57–0.90
  if (y > 0.57 && y < 0.90 && nz < -0.30) return 'hamstrings'

  // ── LOWER LEG ──
  // Gastrocnemius: posterior calf, y 0.34–0.58
  if (y > 0.34 && y < 0.58 && nz < -0.15) return 'gastrocnemius'
  // Soleus: lower calf, y 0.17–0.33
  if (y > 0.17 && y < 0.33) return 'soleus'

  return null
}
