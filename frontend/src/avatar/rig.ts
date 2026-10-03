import * as THREE from 'three'

export type Vec3 = { x: number; y: number; z: number }

export type ArmPose = {
  shoulder: Vec3
  elbow: Vec3
  wrist: Vec3
  /** 21 hand landmarks in the same scene space as the arm, or null when the hand is not visible. */
  hand: Vec3[] | null
}

export type HeadPose = {
  nose: Vec3
  leftEar: Vec3
  rightEar: Vec3
}

export type BodyPose = {
  left: ArmPose | null
  right: ArmPose | null
  head: HeadPose | null
}

type Side = 'Left' | 'Right'

type BoneEntry = {
  bone: THREE.Bone
  restLocal: THREE.Quaternion
  restWorld: THREE.Quaternion
  forwardLocal: THREE.Vector3
  sideLocal: THREE.Vector3 | null
  hingeLocal: THREE.Vector3 | null
  curl: number
  splay: number
}

const FINGERS = [
  { name: 'Thumb', joints: [1, 2, 3, 4] },
  { name: 'Index', joints: [5, 6, 7, 8] },
  { name: 'Middle', joints: [9, 10, 11, 12] },
  { name: 'Ring', joints: [13, 14, 15, 16] },
  { name: 'Pinky', joints: [17, 18, 19, 20] },
] as const

const _forward = new THREE.Vector3()
const _x = new THREE.Vector3()
const _y = new THREE.Vector3()
const _z = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _alt = new THREE.Vector3(1, 0, 0)
const _localBasis = new THREE.Matrix4()
const _worldBasis = new THREE.Matrix4()
const _qLocal = new THREE.Quaternion()
const _qWorld = new THREE.Quaternion()
const _desiredWorld = new THREE.Quaternion()
const _parentInv = new THREE.Quaternion()
const _solved = new THREE.Quaternion()
const _restForward = new THREE.Vector3()
const _delta = new THREE.Quaternion()
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()

const _cross = new THREE.Vector3()
const _euler = new THREE.Euler(0, 0, 0, 'YXZ')

const BONE_TAU = 0.04
const BONE_SOFT_ZONE = 0.09
const BONE_REST_SPEED = 0.06
const CURL_LIMIT = 1.75
const SPLAY_LIMIT = 0.45
const ANGLE_DEADZONE = 0.03
const ANGLE_TAU = 0.055
const SHOULDER_LIMIT = 0.5
const HINGE_MIN_BEND = 0.35
const HEAD_DEADZONE = 0.025
const HEAD_TAU_SLOW = 0.22
const HEAD_TAU_FAST = 0.07
const NECK_NAMES = ['Neck', 'Neck1', 'Neck2'] as const

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function vec(v: Vec3, out = new THREE.Vector3()) {
  return out.set(v.x, v.y, v.z)
}

function basis(forward: THREE.Vector3, sideHint: THREE.Vector3, target: THREE.Matrix4) {
  _y.copy(forward).normalize()
  _x.copy(sideHint).addScaledVector(_y, -sideHint.dot(_y))
  if (_x.lengthSq() < 1e-6) {
    const helper = Math.abs(_y.dot(_up)) < 0.9 ? _up : _alt
    _x.crossVectors(helper, _y)
  }
  _x.normalize()
  _z.crossVectors(_x, _y).normalize()
  target.makeBasis(_x, _y, _z)
}

export class AvatarRig {
  private readonly entries = new Map<string, BoneEntry>()
  private readonly bones = new Map<string, THREE.Bone>()
  private readonly hingeSign = new Map<Side, THREE.Vector3>()
  private readonly acrossSign = new Map<Side, THREE.Vector3>()
  private clock = 0
  private glanceYaw = 0
  private glancePitch = 0
  private glanceHold = 0
  private glanceNext = 1.6
  private headYaw = 0
  private headPitch = 0
  private headRoll = 0

  constructor(root: THREE.Object3D) {
    root.updateMatrixWorld(true)
    root.traverse((object) => {
      const bone = object as THREE.Bone
      if (!bone.isBone) return
      this.bones.set(bone.name, bone)
      const canonical = bone.name.replace(/_\d+$/, '')
      if (canonical !== bone.name && !this.bones.has(canonical)) this.bones.set(canonical, bone)
    })
    this.addChildAxis('LeftShoulder', 'LeftArm')
    this.addChildAxis('RightShoulder', 'RightArm')
    for (const name of ['Neck', 'Neck1', 'Neck2', 'Head', 'LeftEye', 'RightEye']) this.addRest(name)
    for (const side of ['Left', 'Right'] as const) {
      this.addChildAxis(`${side}Arm`, `${side}ForeArm`)
      this.addChildAxis(`${side}ForeArm`, `${side}Hand`)
      this.addHand(side)
      this.addFingers(side)
      this.captureHinge(side)
    }
  }

  apply(pose: BodyPose, dt = 1 / 60) {
    this.applyShoulders(pose, dt)
    this.applySide('Left', pose.left, dt)
    this.applySide('Right', pose.right, dt)
    this.applyHead(pose.head, dt)
  }

  private applyShoulders(pose: BodyPose, dt: number) {
    const left = pose.left
    const right = pose.right
    if (left && right) {
      this.aimLimited('LeftShoulder', this.shoulderAim(left, right, _x), SHOULDER_LIMIT, dt)
      this.aimLimited('RightShoulder', this.shoulderAim(right, left, _y), SHOULDER_LIMIT, dt)
      return
    }
    if (left && !right) this.aimLimited('LeftShoulder', _x.set(left.shoulder.x, 0, left.shoulder.z), SHOULDER_LIMIT, dt)
    else if (!left) this.release(['LeftShoulder'], dt)
    if (right && !left) this.aimLimited('RightShoulder', _x.set(right.shoulder.x, 0, right.shoulder.z), SHOULDER_LIMIT, dt)
    else if (!right) this.release(['RightShoulder'], dt)
  }

  private shoulderAim(arm: ArmPose, other: ArmPose, out: THREE.Vector3) {
    const raise = Math.max(0, arm.shoulder.y - other.shoulder.y)
    const lift = Math.max(0, arm.elbow.y - arm.shoulder.y) * 0.55
    return out.set(
      arm.shoulder.x - other.shoulder.x * 0.08,
      raise + lift,
      arm.shoulder.z - other.shoulder.z * 0.12,
    )
  }

  private applyHead(head: HeadPose | null, dt: number) {
    this.clock += dt
    if (!head) {
      this.release([...NECK_NAMES, 'Head', 'LeftEye', 'RightEye'], dt)
      return
    }

    const leftEar = vec(head.leftEar, _a)
    const rightEar = vec(head.rightEar, _b)
    const nose = vec(head.nose, _c)
    _forward.copy(nose).sub(_x.copy(leftEar).add(rightEar).multiplyScalar(0.5))
    if (_forward.lengthSq() < 1e-6) return
    _forward.normalize()

    this.headYaw = this.steadyAngle(this.headYaw, clamp(Math.atan2(_forward.x, _forward.z), -0.8, 0.8), dt)
    this.headPitch = this.steadyAngle(this.headPitch, clamp(-Math.asin(clamp(_forward.y, -1, 1)), -0.45, 0.45), dt)
    this.headRoll = this.steadyAngle(
      this.headRoll,
      clamp(Math.atan2(leftEar.y - rightEar.y, leftEar.x - rightEar.x), -0.4, 0.4),
      dt,
    )
    const yaw = this.headYaw
    const pitch = this.headPitch
    const roll = this.headRoll
    const follow = 1 - Math.exp(-dt / BONE_TAU)

    for (const name of NECK_NAMES) {
      const entry = this.entries.get(name)
      if (!entry) continue
      _delta.setFromEuler(_euler.set(pitch * 0.16, yaw * 0.16, roll * 0.08, 'YXZ'))
      _solved.copy(entry.restLocal).multiply(_delta)
      entry.bone.quaternion.slerp(_solved, follow)
      entry.bone.updateMatrixWorld()
    }

    const headEntry = this.entries.get('Head')
    if (headEntry) {
      _delta.setFromEuler(_euler.set(pitch, yaw, roll, 'YXZ'))
      _desiredWorld.copy(headEntry.restWorld).multiply(_delta)
      headEntry.bone.parent?.getWorldQuaternion(_parentInv).invert()
      _solved.copy(_desiredWorld).premultiply(_parentInv)
      headEntry.bone.quaternion.slerp(_solved, follow)
      headEntry.bone.updateMatrixWorld()
    }

    this.applyEyes(yaw, pitch, dt)
  }

  /** Ignores sub-degree landmark noise and eases harder on small changes than on real turns. */
  private steadyAngle(current: number, target: number, dt: number) {
    const diff = target - current
    if (Math.abs(diff) < HEAD_DEADZONE) return current
    const tau = HEAD_TAU_SLOW + (HEAD_TAU_FAST - HEAD_TAU_SLOW) * clamp(Math.abs(diff) / 0.35, 0, 1)
    return current + diff * (1 - Math.exp(-dt / tau))
  }

  private applyEyes(yaw: number, pitch: number, dt: number) {
    if (this.clock >= this.glanceNext) {
      const away = Math.random() < 0.35
      this.glanceYaw = away ? (Math.random() - 0.5) * 0.5 : 0
      this.glancePitch = away ? (Math.random() - 0.5) * 0.18 : 0
      this.glanceHold = this.clock + 0.5 + Math.random() * 0.9
      this.glanceNext = this.glanceHold + 0.8 + Math.random() * 2.2
    } else if (this.clock > this.glanceHold) {
      this.glanceYaw = 0
      this.glancePitch = 0
    }
    const eyeYaw = clamp(yaw * -0.5 + this.glanceYaw, -0.35, 0.35)
    const eyePitch = clamp(pitch * -0.35 + this.glancePitch, -0.2, 0.2)
    _delta.setFromEuler(_euler.set(eyePitch, eyeYaw, 0, 'YXZ'))
    const snap = 1 - Math.exp(-dt / 0.035)
    for (const name of ['LeftEye', 'RightEye']) {
      const entry = this.entries.get(name)
      if (!entry) continue
      _solved.copy(entry.restLocal).multiply(_delta)
      entry.bone.quaternion.slerp(_solved, snap)
    }
  }

  private aimLimited(name: string, forwardWorld: THREE.Vector3, maxAngle: number, dt: number) {
    const entry = this.entries.get(name)
    if (!entry || forwardWorld.lengthSq() < 1e-8) {
      if (entry) entry.bone.quaternion.slerp(entry.restLocal, 0.2)
      return
    }
    _qLocal.copy(this.solveSwing(entry, forwardWorld))
    _delta.copy(entry.restLocal).invert().multiply(_qLocal)
    if (_delta.w < 0) _delta.set(-_delta.x, -_delta.y, -_delta.z, -_delta.w)
    const angle = 2 * Math.acos(clamp(_delta.w, -1, 1))
    if (angle > maxAngle && angle > 1e-5) {
      _qWorld.identity().slerp(_delta, maxAngle / angle)
      _delta.copy(_qWorld)
    }
    _solved.copy(entry.restLocal).multiply(_delta)
    this.follow(entry.bone, _solved, dt)
    entry.bone.updateMatrixWorld()
  }

  private applySide(side: Side, arm: ArmPose | null, dt: number) {
    const armBones = this.armBoneNames(side)
    if (!arm) {
      this.release(armBones, dt)
      return
    }

    const shoulder = vec(arm.shoulder, _a)
    const elbow = vec(arm.elbow, _b)
    const wrist = vec(arm.wrist, _c)
    const upper = elbow.clone().sub(shoulder)
    const fore = wrist.clone().sub(elbow)
    const hinge = this.elbowHinge(side, upper, fore)

    this.aim(`${side}Arm`, upper, hinge, dt)
    this.aim(`${side}ForeArm`, fore, hinge, dt)

    if (arm.hand && arm.hand.length >= 21) {
      this.applyHand(side, arm.hand, dt)
    } else {
      this.release(
        armBones.filter((name) => name !== `${side}Arm` && name !== `${side}ForeArm`),
        dt,
      )
    }
  }

  private applyHand(side: Side, hand: Vec3[], dt: number) {
    const wrist = vec(hand[0])
    const index = vec(hand[5])
    const middle = vec(hand[9])
    const pinky = vec(hand[17])
    const forward = middle.sub(wrist)
    const across = pinky.clone().sub(index)

    this.aim(`${side}Hand`, forward, this.handAcross(side, forward, across), dt)

    for (const finger of FINGERS) {
      for (let segment = 0; segment < 3; segment++) {
        const from = vec(hand[finger.joints[segment]])
        const to = vec(hand[finger.joints[segment + 1]])
        this.curlFinger(`${side}Hand${finger.name}${segment + 1}`, to.sub(from), dt)
      }
    }
  }

  private aim(name: string, forwardWorld: THREE.Vector3, sideWorld: THREE.Vector3 | null, dt: number) {
    const entry = this.entries.get(name)
    if (!entry || forwardWorld.lengthSq() < 1e-8) {
      if (entry) entry.bone.quaternion.slerp(entry.restLocal, 0.2)
      return
    }

    const solved =
      sideWorld && sideWorld.lengthSq() > 1e-6 && entry.sideLocal
        ? this.solveBasis(entry, forwardWorld, sideWorld)
        : this.solveSwing(entry, forwardWorld)

    this.follow(entry.bone, solved, dt)
    entry.bone.updateMatrixWorld()
  }

  /** Small rotation differences are mostly noise, so they ease in slowly; real moves follow at full speed. */
  private follow(bone: THREE.Bone, target: THREE.Quaternion, dt: number) {
    const closeness = clamp(bone.quaternion.angleTo(target) / BONE_SOFT_ZONE, 0, 1)
    const speed = Math.max(BONE_REST_SPEED, closeness * closeness)
    bone.quaternion.slerp(target, (1 - Math.exp(-dt / BONE_TAU)) * speed)
  }

  private curlFinger(name: string, worldDir: THREE.Vector3, dt: number) {
    const entry = this.entries.get(name)
    if (!entry?.hingeLocal || !entry.sideLocal || worldDir.lengthSq() < 1e-8) return
    const parent = entry.bone.parent
    if (!parent) return

    parent.getWorldQuaternion(_parentInv)
    _forward.copy(worldDir).normalize().applyQuaternion(_parentInv.invert())
    _forward.applyQuaternion(_qLocal.copy(entry.restLocal).invert())

    const hinge = entry.hingeLocal
    const forward = entry.forwardLocal
    const curl = Math.atan2(_cross.crossVectors(forward, _forward).dot(hinge), forward.dot(_forward))
    _solved.setFromAxisAngle(hinge, curl)
    _restForward.copy(forward).applyQuaternion(_solved)
    const splay = Math.atan2(_cross.crossVectors(_restForward, _forward).dot(entry.sideLocal), _restForward.dot(_forward))

    entry.curl = this.followAngle(entry.curl, clamp(curl, -CURL_LIMIT, CURL_LIMIT), dt)
    entry.splay = this.followAngle(entry.splay, clamp(splay, -SPLAY_LIMIT, SPLAY_LIMIT), dt)
    this.writeFinger(entry)
  }

  private writeFinger(entry: BoneEntry) {
    if (!entry.hingeLocal || !entry.sideLocal) return
    _solved.setFromAxisAngle(entry.hingeLocal, entry.curl)
    _delta.setFromAxisAngle(entry.sideLocal, entry.splay)
    entry.bone.quaternion.copy(entry.restLocal).multiply(_delta).multiply(_solved)
    entry.bone.updateMatrixWorld()
  }

  private followAngle(current: number, target: number, dt: number) {
    if (Math.abs(target - current) < ANGLE_DEADZONE) return current
    const alpha = 1 - Math.exp(-dt / ANGLE_TAU)
    return current + (target - current) * alpha
  }

  private solveBasis(entry: BoneEntry, forwardWorld: THREE.Vector3, sideWorld: THREE.Vector3) {
    basis(entry.forwardLocal, entry.sideLocal!, _localBasis)
    basis(forwardWorld, sideWorld, _worldBasis)
    _qLocal.setFromRotationMatrix(_localBasis).invert()
    _qWorld.setFromRotationMatrix(_worldBasis)
    _desiredWorld.copy(_qLocal).premultiply(_qWorld)
    entry.bone.parent?.getWorldQuaternion(_parentInv).invert()
    return _solved.copy(_desiredWorld).premultiply(_parentInv)
  }

  private solveSwing(entry: BoneEntry, forwardWorld: THREE.Vector3) {
    _restForward.copy(entry.forwardLocal).applyQuaternion(entry.restWorld).normalize()
    _forward.copy(forwardWorld).normalize()
    _delta.setFromUnitVectors(_restForward, _forward)
    _desiredWorld.copy(entry.restWorld).premultiply(_delta)
    entry.bone.parent?.getWorldQuaternion(_parentInv).invert()
    return _solved.copy(_desiredWorld).premultiply(_parentInv)
  }

  private release(names: string[], dt: number) {
    for (const name of names) {
      const entry = this.entries.get(name)
      if (!entry) continue
      if (entry.hingeLocal) {
        entry.curl = this.followAngle(entry.curl, 0, dt)
        entry.splay = this.followAngle(entry.splay, 0, dt)
        this.writeFinger(entry)
      } else {
        entry.bone.quaternion.slerp(entry.restLocal, 0.15)
      }
    }
  }

  /**
   * Elbow axis from the arm bend. A nearly straight arm has no reliable axis, so the last
   * clear one is reused, and the sign never flips between frames.
   */
  private elbowHinge(side: Side, upper: THREE.Vector3, fore: THREE.Vector3) {
    const prev = this.hingeSign.get(side)
    const hinge = new THREE.Vector3().crossVectors(upper, fore)
    const bend = hinge.length() / Math.max(1e-6, upper.length() * fore.length())
    if (bend < HINGE_MIN_BEND) return prev?.clone() ?? null
    hinge.normalize()
    if (prev && prev.dot(hinge) < 0) hinge.negate()
    if (prev) {
      prev.lerp(hinge, clamp((bend - HINGE_MIN_BEND) * 2, 0.15, 1)).normalize()
      return prev.clone()
    }
    this.hingeSign.set(side, hinge.clone())
    return hinge
  }

  private armBoneNames(side: Side) {
    const names = [`${side}Arm`, `${side}ForeArm`, `${side}Hand`]
    for (const finger of FINGERS) {
      for (let segment = 1; segment <= 3; segment++) {
        names.push(`${side}Hand${finger.name}${segment}`)
      }
    }
    return names
  }

  private addRest(name: string) {
    const bone = this.find(name)
    if (!bone) return
    this.remember(name, bone, _up)
  }

  private addChildAxis(name: string, childName: string) {
    const bone = this.find(name)
    const child = this.find(childName)
    if (!bone || !child) return
    this.remember(name, bone, child.position)
  }

  private addHand(side: Side) {
    const hand = this.find(`${side}Hand`)
    const middle = this.find(`${side}HandMiddle1`)
    const index = this.find(`${side}HandIndex1`)
    const pinky = this.find(`${side}HandPinky1`)
    if (!hand || !middle || !index || !pinky) return

    const forward = middle.position.clone()
    const across = pinky.position.clone().sub(index.position)
    this.remember(`${side}Hand`, hand, forward, across)
  }

  /** Pinky-to-index direction, kept only when it actually spans the palm. The sign is the landmark sign. */
  private handAcross(side: Side, forward: THREE.Vector3, across: THREE.Vector3) {
    _y.copy(forward).normalize()
    _x.copy(across).addScaledVector(_y, -across.dot(_y))
    if (_x.lengthSq() < 1e-4) return this.acrossSign.get(side)?.clone() ?? null
    _x.normalize()
    const prev = this.acrossSign.get(side)
    if (prev) prev.copy(_x)
    else this.acrossSign.set(side, _x.clone())
    return _x.clone()
  }

  /** Direction the middle finger already flexes at rest. That side is the palm. */
  private restPalmBend(side: Side) {
    const proximal = this.find(`${side}HandMiddle1`)
    const middle = this.find(`${side}HandMiddle2`)
    const distal = this.find(`${side}HandMiddle3`)
    if (!proximal || !middle || !distal) return null
    const dirA = middle.position.clone().normalize().applyQuaternion(proximal.getWorldQuaternion(new THREE.Quaternion()))
    const dirB = distal.position.clone().normalize().applyQuaternion(middle.getWorldQuaternion(new THREE.Quaternion()))
    const bend = dirB.sub(dirA)
    bend.addScaledVector(dirA, -bend.dot(dirA))
    if (bend.lengthSq() < 1e-4) return null
    return bend.normalize()
  }

  private addFingers(side: Side) {
    const hand = this.entries.get(`${side}Hand`)
    if (!hand?.sideLocal) return

    const palmWorld = this.restPalmBend(side) ?? new THREE.Vector3().crossVectors(hand.forwardLocal, hand.sideLocal).normalize().applyQuaternion(hand.restWorld)

    for (const finger of FINGERS) {
      for (let segment = 1; segment <= 3; segment++) {
        const name = `${side}Hand${finger.name}${segment}`
        const bone = this.find(name)
        const child = this.find(`${side}Hand${finger.name}${segment + 1}`)
        if (!bone || !child) continue
        const forward = child.position.clone()
        const restWorld = bone.getWorldQuaternion(new THREE.Quaternion())
        const forwardWorld = forward.clone().normalize().applyQuaternion(restWorld)
        const hingeWorld = new THREE.Vector3().crossVectors(forwardWorld, palmWorld)
        if (hingeWorld.lengthSq() < 1e-8) continue
        hingeWorld.normalize()
        const restInverse = restWorld.clone().invert()
        const hingeLocal = hingeWorld.applyQuaternion(restInverse)
        const sideLocal = palmWorld.clone().applyQuaternion(restInverse)
        this.entries.set(name, {
          bone,
          restLocal: bone.quaternion.clone().normalize(),
          restWorld,
          forwardLocal: forward.normalize(),
          sideLocal,
          hingeLocal,
          curl: 0,
          splay: 0,
        })
      }
    }
  }

  private captureHinge(side: Side) {
    const arm = this.entries.get(`${side}Arm`)
    const fore = this.entries.get(`${side}ForeArm`)
    const hand = this.find(`${side}Hand`)
    if (!arm || !fore || !hand) return

    const shoulder = arm.bone.getWorldPosition(new THREE.Vector3())
    const elbow = fore.bone.getWorldPosition(new THREE.Vector3())
    const wrist = hand.getWorldPosition(new THREE.Vector3())
    const hinge = new THREE.Vector3().crossVectors(elbow.clone().sub(shoulder), wrist.clone().sub(elbow))
    if (hinge.lengthSq() < 1e-6) return
    hinge.normalize()
    this.hingeSign.set(side, hinge.clone())

    for (const entry of [arm, fore]) {
      entry.sideLocal = hinge.clone().applyQuaternion(entry.restWorld.clone().invert())
    }
  }

  private remember(name: string, bone: THREE.Bone, forward: THREE.Vector3, side: THREE.Vector3 | null = null) {
    const restWorld = bone.getWorldQuaternion(new THREE.Quaternion())
    this.entries.set(name, {
      bone,
      restLocal: bone.quaternion.clone().normalize(),
      restWorld,
      forwardLocal: forward.clone().normalize(),
      sideLocal: side?.clone().normalize() ?? null,
      hingeLocal: null,
      curl: 0,
      splay: 0,
    })
  }

  private find(name: string) {
    return this.bones.get(name) ?? null
  }
}
