import * as THREE from 'three'

export type Vec3 = { x: number; y: number; z: number }

export type ArmPose = {
  shoulder: Vec3
  elbow: Vec3
  wrist: Vec3
  /** 21 hand landmarks in the same scene space as the arm, or null when the hand is not visible. */
  hand: Vec3[] | null
}

export type BodyPose = {
  left: ArmPose | null
  right: ArmPose | null
}

type Side = 'Left' | 'Right'

type BoneEntry = {
  bone: THREE.Bone
  restLocal: THREE.Quaternion
  restWorld: THREE.Quaternion
  forwardLocal: THREE.Vector3
  sideLocal: THREE.Vector3 | null
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

const SMOOTH = 0.45

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
  private readonly hingeSign = new Map<Side, THREE.Vector3>()
  private readonly acrossSign = new Map<Side, THREE.Vector3>()
  private readonly root: THREE.Object3D

  constructor(root: THREE.Object3D) {
    this.root = root
    root.updateMatrixWorld(true)
    for (const side of ['Left', 'Right'] as const) {
      this.addChildAxis(`${side}Arm`, `${side}ForeArm`)
      this.addChildAxis(`${side}ForeArm`, `${side}Hand`)
      this.addHand(side)
      this.addFingers(side)
      this.captureHinge(side)
    }
  }

  apply(pose: BodyPose) {
    this.applySide('Left', pose.left)
    this.applySide('Right', pose.right)
  }

  private applySide(side: Side, arm: ArmPose | null) {
    const armBones = this.armBoneNames(side)
    if (!arm) {
      this.release(armBones)
      return
    }

    const shoulder = vec(arm.shoulder, _a)
    const elbow = vec(arm.elbow, _b)
    const wrist = vec(arm.wrist, _c)
    const upper = elbow.clone().sub(shoulder)
    const fore = wrist.clone().sub(elbow)
    const hinge = new THREE.Vector3().crossVectors(upper, fore)
    const hingeOk = this.stabilizeHinge(side, hinge)

    this.aim(`${side}Arm`, upper, hingeOk ? hinge : null)
    this.aim(`${side}ForeArm`, fore, hingeOk ? hinge : null)

    if (arm.hand && arm.hand.length >= 21) {
      this.applyHand(side, arm.hand)
    } else {
      this.release(armBones.filter((name) => name !== `${side}Arm` && name !== `${side}ForeArm`))
    }
  }

  private applyHand(side: Side, hand: Vec3[]) {
    const wrist = vec(hand[0])
    const index = vec(hand[5])
    const middle = vec(hand[9])
    const pinky = vec(hand[17])
    const forward = middle.sub(wrist)
    const across = pinky.clone().sub(index)
    const acrossOk = this.stabilizeVector(this.acrossSign, side, across)

    this.aim(`${side}Hand`, forward, acrossOk ? across : null)

    for (const finger of FINGERS) {
      for (let segment = 0; segment < 3; segment++) {
        const from = vec(hand[finger.joints[segment]])
        const to = vec(hand[finger.joints[segment + 1]])
        // Swing only. A palm-normal twist is often 180° off and the short blend then curls backward.
        this.aim(`${side}Hand${finger.name}${segment + 1}`, to.sub(from), null)
      }
    }
  }

  private aim(name: string, forwardWorld: THREE.Vector3, sideWorld: THREE.Vector3 | null) {
    const entry = this.entries.get(name)
    if (!entry || forwardWorld.lengthSq() < 1e-8) {
      if (entry) entry.bone.quaternion.slerp(entry.restLocal, 0.2)
      return
    }

    const solved =
      sideWorld && sideWorld.lengthSq() > 1e-6 && entry.sideLocal
        ? this.solveBasis(entry, forwardWorld, sideWorld)
        : this.solveSwing(entry, forwardWorld)

    entry.bone.quaternion.slerp(solved, SMOOTH)
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

  private release(names: string[]) {
    for (const name of names) {
      const entry = this.entries.get(name)
      if (entry) entry.bone.quaternion.slerp(entry.restLocal, 0.2)
    }
  }

  private stabilizeHinge(side: Side, hinge: THREE.Vector3) {
    return this.stabilizeVector(this.hingeSign, side, hinge)
  }

  private stabilizeVector(store: Map<Side, THREE.Vector3>, side: Side, vector: THREE.Vector3) {
    if (vector.lengthSq() < 1e-4) return false
    vector.normalize()
    const prev = store.get(side)
    if (prev && prev.dot(vector) < 0) vector.negate()
    if (prev) prev.copy(vector)
    else store.set(side, vector.clone())
    return true
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

  private addChildAxis(name: string, childName: string) {
    const bone = this.find(name)
    const child = this.find(childName)
    if (!bone || !child) return
    this.remember(bone, child.position)
  }

  private addHand(side: Side) {
    const hand = this.find(`${side}Hand`)
    const middle = this.find(`${side}HandMiddle1`)
    const index = this.find(`${side}HandIndex1`)
    const pinky = this.find(`${side}HandPinky1`)
    if (!hand || !middle || !index || !pinky) return

    const forward = middle.position.clone()
    const across = pinky.position.clone().sub(index.position)
    this.remember(hand, forward, across)
    const entry = this.entries.get(`${side}Hand`)
    if (entry?.sideLocal) {
      this.acrossSign.set(side, entry.sideLocal.clone().applyQuaternion(entry.restWorld).normalize())
    }
  }

  private addFingers(side: Side) {
    const hand = this.entries.get(`${side}Hand`)
    if (!hand?.sideLocal) return

    const palmLocal = new THREE.Vector3().crossVectors(hand.forwardLocal, hand.sideLocal).normalize()
    const palmWorld = palmLocal.applyQuaternion(hand.restWorld)

    for (const finger of FINGERS) {
      for (let segment = 1; segment <= 3; segment++) {
        const name = `${side}Hand${finger.name}${segment}`
        const bone = this.find(name)
        const child = this.find(`${side}Hand${finger.name}${segment + 1}`)
        if (!bone || !child) continue
        const forward = child.position.clone()
        const restWorld = bone.getWorldQuaternion(new THREE.Quaternion())
        const sideLocal = palmWorld.clone().applyQuaternion(restWorld.clone().invert())
        this.entries.set(name, {
          bone,
          restLocal: bone.quaternion.clone().normalize(),
          restWorld,
          forwardLocal: forward.normalize(),
          sideLocal,
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

  private remember(bone: THREE.Bone, forward: THREE.Vector3, side: THREE.Vector3 | null = null) {
    const restWorld = bone.getWorldQuaternion(new THREE.Quaternion())
    this.entries.set(bone.name, {
      bone,
      restLocal: bone.quaternion.clone().normalize(),
      restWorld,
      forwardLocal: forward.clone().normalize(),
      sideLocal: side?.clone().normalize() ?? null,
    })
  }

  private find(name: string) {
    const match = this.root.getObjectByName(name)
    return match && (match as THREE.Bone).isBone ? (match as THREE.Bone) : null
  }
}
