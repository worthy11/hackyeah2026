import * as THREE from 'three'

/** Bones used by the scripted “Cześć, jak się masz?” clip. */
export type ScriptedArmBones = {
  rightArm: THREE.Bone
  rightFore: THREE.Bone
  rightHand: THREE.Bone | null
  leftArm: THREE.Bone
  leftFore: THREE.Bone
}

/** Kept for API compatibility — aiming uses world dirs, not euler deltas. */
export type ScriptedArmBases = {
  rightArm: THREE.Euler
  rightFore: THREE.Euler
  rightHand: THREE.Euler
  leftArm: THREE.Euler
  leftFore: THREE.Euler
}

export const SCRIPTED_HELLO_DURATION_S = 4.8

function clamp01(t: number) {
  return Math.min(1, Math.max(0, t))
}

function smoothstep(t: number) {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}

function seg(t: number, a: number, b: number) {
  if (b <= a) return 0
  return smoothstep((t - a) / (b - a))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function lerpDir(a: THREE.Vector3, b: THREE.Vector3, t: number, out: THREE.Vector3) {
  out.set(
    lerp(a.x, b.x, t),
    lerp(a.y, b.y, t),
    lerp(a.z, b.z, t),
  ).normalize()
  return out
}

/**
 * Aim a bone so its primary child points along `worldDir`.
 * Same technique as the idle “arms down” pose — stable across Mixamo bind poses.
 */
function aimBoneAlong(bone: THREE.Bone, worldDir: THREE.Vector3) {
  const child = bone.children.find((c): c is THREE.Bone => c instanceof THREE.Bone)
  const parent = bone.parent
  if (!child || !parent) return
  const restDir = child.position.clone()
  if (restDir.lengthSq() < 1e-8) return
  restDir.normalize()
  parent.updateWorldMatrix(true, false)
  const parentInv = new THREE.Matrix4().copy(parent.matrixWorld).invert()
  const targetParent = worldDir.clone().normalize().transformDirection(parentInv).normalize()
  bone.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(restDir, targetParent))
}

export function captureScriptedArmBases(bones: ScriptedArmBones): ScriptedArmBases {
  return {
    rightArm: bones.rightArm.rotation.clone(),
    rightFore: bones.rightFore.rotation.clone(),
    rightHand: bones.rightHand?.rotation.clone() ?? new THREE.Euler(),
    leftArm: bones.leftArm.rotation.clone(),
    leftFore: bones.leftFore.rotation.clone(),
  }
}

// World directions: avatar faces +Z (camera). Character's right = −X.
const IDLE_UPPER = new THREE.Vector3(-0.12, -1, 0.05).normalize()
const IDLE_FORE = new THREE.Vector3(-0.08, -0.95, 0.25).normalize()

// Salute: hand up toward temple (front-right of head)
const SALUTE_UPPER = new THREE.Vector3(-0.55, 0.35, 0.45).normalize()
const SALUTE_FORE = new THREE.Vector3(-0.25, 0.75, 0.40).normalize()

// Offer: hand forward toward camera, mid-chest height
const OFFER_UPPER = new THREE.Vector3(-0.35, 0.05, 0.80).normalize()
const OFFER_FORE = new THREE.Vector3(-0.10, 0.12, 0.90).normalize()

const _upper = new THREE.Vector3()
const _fore = new THREE.Vector3()

/**
 * t in seconds.
 * salute → pause → offer with 2× forward/back sway + light bob → rest
 */
export function applyScriptedHello(
  bones: ScriptedArmBones,
  bases: ScriptedArmBases,
  t: number,
) {
  // Left arm: locked to idle world aim (never behind the back).
  aimBoneAlong(bones.leftArm, new THREE.Vector3(0.12, -1, 0.05))
  bones.leftArm.updateMatrixWorld(true)
  aimBoneAlong(bones.leftFore, new THREE.Vector3(0.08, -0.95, 0.25))
  // Match idle soft elbow bend
  bones.leftFore.quaternion.multiply(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.35),
  )

  if (t < 0.5) {
    const u = seg(t, 0, 0.5)
    lerpDir(IDLE_UPPER, SALUTE_UPPER, u, _upper)
    lerpDir(IDLE_FORE, SALUTE_FORE, u, _fore)
  } else if (t < 1.2) {
    _upper.copy(SALUTE_UPPER)
    _fore.copy(SALUTE_FORE)
  } else if (t < 1.6) {
    const u = seg(t, 1.2, 1.6)
    // Soften toward a neutral raised pose
    const midU = new THREE.Vector3(-0.4, 0.15, 0.55).normalize()
    const midF = new THREE.Vector3(-0.2, 0.45, 0.55).normalize()
    lerpDir(SALUTE_UPPER, midU, u, _upper)
    lerpDir(SALUTE_FORE, midF, u, _fore)
  } else if (t < 2.2) {
    const u = seg(t, 1.6, 2.2)
    const midU = new THREE.Vector3(-0.4, 0.15, 0.55).normalize()
    const midF = new THREE.Vector3(-0.2, 0.45, 0.55).normalize()
    lerpDir(midU, OFFER_UPPER, u, _upper)
    lerpDir(midF, OFFER_FORE, u, _fore)
  } else if (t < 4.3) {
    // Two back-forth cycles: sway in X (toward/away from body center) + Z bob feel via Y
    const phase = ((t - 2.2) / 2.1) * Math.PI * 4
    const sway = Math.sin(phase) * 0.18
    const bob = Math.sin(phase) * 0.10
    _upper.set(OFFER_UPPER.x + sway, OFFER_UPPER.y + bob, OFFER_UPPER.z).normalize()
    _fore.set(OFFER_FORE.x + sway * 0.7, OFFER_FORE.y + bob * 0.8, OFFER_FORE.z).normalize()
  } else {
    const u = seg(t, 4.3, SCRIPTED_HELLO_DURATION_S)
    lerpDir(OFFER_UPPER, IDLE_UPPER, u, _upper)
    lerpDir(OFFER_FORE, IDLE_FORE, u, _fore)
  }

  aimBoneAlong(bones.rightArm, _upper)
  bones.rightArm.updateMatrixWorld(true)
  aimBoneAlong(bones.rightFore, _fore)

  // Keep hand from twisting wildly — restore near idle local, small natural tilt when offering
  if (bones.rightHand) {
    const offerTilt = t >= 1.6 && t < 4.3 ? 0.35 : 0
    const u = t < 1.6 ? 0 : t < 2.2 ? seg(t, 1.6, 2.2) : t < 4.3 ? 1 : 1 - seg(t, 4.3, SCRIPTED_HELLO_DURATION_S)
    bones.rightHand.rotation.set(
      bases.rightHand.x + offerTilt * u * 0.5,
      bases.rightHand.y,
      bases.rightHand.z + offerTilt * u * 0.15,
    )
  }
}
