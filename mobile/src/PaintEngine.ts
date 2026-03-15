import * as THREE from 'three'

const TEX_SIZE = 512
// Paint color #ff5c7a = rgb(255, 92, 122)
const PAINT_R = 255
const PAINT_G = 92
const PAINT_B = 122

export class PaintEngine {
  private data: Uint8Array
  readonly texture: THREE.DataTexture
  brushSize = 30
  mode: 'add' | 'erase' = 'add'
  private _detectedMuscles = new Set<string>()

  constructor() {
    this.data = new Uint8Array(TEX_SIZE * TEX_SIZE * 4)
    this.texture = new THREE.DataTexture(
      this.data,
      TEX_SIZE,
      TEX_SIZE,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    )
    this.texture.flipY = false
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.needsUpdate = true
  }

  get detectedMuscles() {
    return this._detectedMuscles
  }

  paintAtUV(uv: { x: number; y: number }, worldPoint?: THREE.Vector3) {
    const cx = Math.floor(uv.x * TEX_SIZE)
    const cy = Math.floor(uv.y * TEX_SIZE)
    const r = Math.ceil(this.brushSize * (TEX_SIZE / 512))

    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > r) continue

        const px = cx + dx
        const py = cy + dy
        if (px < 0 || px >= TEX_SIZE || py < 0 || py >= TEX_SIZE) continue

        const idx = (py * TEX_SIZE + px) * 4
        const t = 1 - dist / r // 1 at centre, 0 at edge

        if (this.mode === 'erase') {
          const sub = Math.floor(t * 200)
          this.data[idx + 3] = Math.max(0, this.data[idx + 3] - sub)
        } else {
          // Soft additive brush
          const add = Math.floor(t * t * 160)
          this.data[idx] = PAINT_R
          this.data[idx + 1] = PAINT_G
          this.data[idx + 2] = PAINT_B
          this.data[idx + 3] = Math.min(255, this.data[idx + 3] + add)
        }
      }
    }

    this.texture.needsUpdate = true

    if (worldPoint && this.mode === 'add') {
      const muscle = detectMuscleFromPoint(worldPoint)
      if (muscle) this._detectedMuscles.add(muscle)
    }
  }

  clear() {
    this.data.fill(0)
    this.texture.needsUpdate = true
    this._detectedMuscles = new Set()
  }
}

function detectMuscleFromPoint(point: THREE.Vector3): string | null {
  const { x, y, z } = point
  const absX = Math.abs(x)

  if (y > 1.9) return null

  if (absX > 0.28 && y > 0.85 && y < 1.85) {
    if (y > 1.6) {
      if (z > 0.03) return 'front_delt'
      if (z < -0.03) return 'rear_delt'
      return 'side_delt'
    }
    if (y > 1.25) return z >= 0 ? 'biceps' : 'triceps'
    return 'forearms'
  }

  if (absX > 0.2 && y > 1.6 && y < 1.85) {
    if (z > 0.03) return 'front_delt'
    if (z < -0.03) return 'rear_delt'
    return 'side_delt'
  }

  if (y > 1.6 && y < 1.85 && absX < 0.2 && z < 0.05) return 'traps'
  if (y > 1.48 && y < 1.65 && z > 0.05) return 'upper_chest'
  if (y > 1.22 && y < 1.48 && z > 0.08) return 'lower_chest'
  if (y > 1.05 && y < 1.6 && z < -0.03 && absX > 0.13) return 'lats'
  if (y > 1.3 && y < 1.65 && z < -0.05) return 'mid_back'
  if (y > 1.0 && y < 1.3 && z < -0.05) return 'lower_back'
  if (y > 1.0 && y < 1.38 && absX > 0.12 && z > -0.03) return 'obliques'
  if (y > 1.18 && y < 1.38 && z >= 0) return 'upper_abs'
  if (y > 1.0 && y < 1.18 && z >= 0) return 'lower_abs'
  if (y > 1.0 && y < 1.15 && z < 0 && absX > 0.08) return 'glute_med'
  if (y > 0.75 && y < 1.1 && z < 0) return 'glute_max'
  if (y > 0.18 && y < 0.38) return 'gastrocnemius'
  if (y >= 0 && y < 0.18) return 'soleus'
  if (y > 0.38 && y < 0.85 && z >= 0) return 'quads'
  if (y > 0.38 && y < 0.85 && z < 0) return 'hamstrings'

  return null
}
