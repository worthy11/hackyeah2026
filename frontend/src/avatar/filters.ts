import type { ArmPose, HeadPose, Vec3 } from './rig'

export type FilterTuning = {
  /** Cutoff in Hz while still. Lower means steadier. */
  minCutoff: number
  /** How fast the cutoff opens up with speed, per m/s. Higher means less lag on fast moves. */
  beta: number
  /** Cutoff in Hz for the speed estimate. Lower keeps noise from reading as motion. */
  speedCutoff: number
  /** Depth is the noisiest axis, so it gets a lower resting cutoff. */
  depthScale: number
}

function smoothingFactor(cutoff: number, dt: number) {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / dt)
}

/** One Euro filter: heavy smoothing at rest, light smoothing during fast motion. */
class OneEuro {
  private value: number | null = null
  private speed = 0
  private readonly minCutoff: number
  private readonly beta: number
  private readonly speedCutoff: number

  constructor(minCutoff: number, beta: number, speedCutoff: number) {
    this.minCutoff = minCutoff
    this.beta = beta
    this.speedCutoff = speedCutoff
  }

  filter(next: number, dt: number) {
    if (this.value === null) {
      this.value = next
      return next
    }
    const rawSpeed = (next - this.value) / dt
    this.speed += (rawSpeed - this.speed) * smoothingFactor(this.speedCutoff, dt)
    const cutoff = this.minCutoff + this.beta * Math.abs(this.speed)
    this.value += (next - this.value) * smoothingFactor(cutoff, dt)
    return this.value
  }

  reset() {
    this.value = null
    this.speed = 0
  }
}

class PointFilter {
  private readonly x: OneEuro
  private readonly y: OneEuro
  private readonly z: OneEuro

  constructor(tuning: FilterTuning) {
    this.x = new OneEuro(tuning.minCutoff, tuning.beta, tuning.speedCutoff)
    this.y = new OneEuro(tuning.minCutoff, tuning.beta, tuning.speedCutoff)
    this.z = new OneEuro(tuning.minCutoff * tuning.depthScale, tuning.beta, tuning.speedCutoff)
  }

  filter(point: Vec3, dt: number): Vec3 {
    return { x: this.x.filter(point.x, dt), y: this.y.filter(point.y, dt), z: this.z.filter(point.z, dt) }
  }

  reset() {
    this.x.reset()
    this.y.reset()
    this.z.reset()
  }
}

const ARM_TUNING: FilterTuning = { minCutoff: 0.15, beta: 10, speedCutoff: 0.3, depthScale: 0.5 }
const HAND_TUNING: FilterTuning = { minCutoff: 0.6, beta: 25, speedCutoff: 0.6, depthScale: 0.6 }
const HEAD_TUNING: FilterTuning = { minCutoff: 0.3, beta: 6, speedCutoff: 0.4, depthScale: 0.6 }

export class ArmFilter {
  private readonly shoulder = new PointFilter(ARM_TUNING)
  private readonly elbow = new PointFilter(ARM_TUNING)
  private readonly wrist = new PointFilter(ARM_TUNING)
  private readonly hand = Array.from({ length: 21 }, () => new PointFilter(HAND_TUNING))
  private hadHand = false

  filter(arm: ArmPose | null, dt: number): ArmPose | null {
    if (!arm) {
      this.reset()
      return null
    }
    if (!arm.hand && this.hadHand) this.hand.forEach((point) => point.reset())
    this.hadHand = Boolean(arm.hand)
    return {
      shoulder: this.shoulder.filter(arm.shoulder, dt),
      elbow: this.elbow.filter(arm.elbow, dt),
      wrist: this.wrist.filter(arm.wrist, dt),
      hand: arm.hand?.map((point, index) => this.hand[index]?.filter(point, dt) ?? point) ?? null,
    }
  }

  private reset() {
    this.shoulder.reset()
    this.elbow.reset()
    this.wrist.reset()
    this.hand.forEach((point) => point.reset())
    this.hadHand = false
  }
}

export class HeadFilter {
  private readonly nose = new PointFilter(HEAD_TUNING)
  private readonly leftEar = new PointFilter(HEAD_TUNING)
  private readonly rightEar = new PointFilter(HEAD_TUNING)

  filter(head: HeadPose | null, dt: number): HeadPose | null {
    if (!head) {
      this.nose.reset()
      this.leftEar.reset()
      this.rightEar.reset()
      return null
    }
    return {
      nose: this.nose.filter(head.nose, dt),
      leftEar: this.leftEar.filter(head.leftEar, dt),
      rightEar: this.rightEar.filter(head.rightEar, dt),
    }
  }
}
