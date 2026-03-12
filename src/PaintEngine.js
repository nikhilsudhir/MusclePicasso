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
  }

  get detectedMuscles() {
    return this._detectedMuscles
  }

  /**
   * Paint a soft brush stroke at a UV coordinate (0–1) and detect the muscle
   * from the 3D world hit point.
   */
  paintAtUV(uv, worldPoint) {
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
        const muscle = detectMuscleFromPoint(worldPoint)
        if (muscle) this._detectedMuscles.add(muscle)
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
  }
}

/**
 * Map a 3D world-space hit point to a muscle group key.
 * Assumes the model is auto-scaled to ~2.2 units tall, feet at y≈0, head at y≈2.2.
 * x is lateral (arms extend outward), z is depth (front = positive, back = negative).
 */
function detectMuscleFromPoint(point) {
  const { x, y, z } = point
  const absX = Math.abs(x)

  // Head/neck — no muscle to target
  if (y > 1.9) return null

  // Arms — identified by significant lateral displacement from torso centre
  if (absX > 0.28 && y > 0.85 && y < 1.85) {
    if (y > 1.6) return 'shoulders'
    if (y > 1.25) return z >= 0 ? 'biceps' : 'triceps'
    return 'forearms'
  }

  // Shoulder caps (deltoid top)
  if (absX > 0.2 && y > 1.6 && y < 1.85) return 'shoulders'

  // Traps — upper back / neck base
  if (y > 1.6 && y < 1.85 && absX < 0.2 && z < 0.05) return 'traps'

  // Chest — front of upper torso
  if (y > 1.2 && y < 1.65 && z > 0.05) return 'chest'

  // Back — rear of upper torso
  if (y > 1.0 && y < 1.7 && z < -0.05) return 'back'

  // Abs — front of mid torso
  if (y > 0.85 && y < 1.3 && z > -0.05) return 'abs'

  // Glutes — rear lower torso
  if (y > 0.75 && y < 1.1 && z < 0) return 'glutes'

  // Quads — front thigh
  if (y > 0.35 && y < 0.85 && z >= 0) return 'quads'

  // Hamstrings — rear thigh
  if (y > 0.3 && y < 0.85 && z < 0) return 'hamstrings'

  // Calves
  if (y >= 0 && y < 0.35) return 'calves'

  return null
}
