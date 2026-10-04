import type { ArmPose, BodyPose, HeadPose, Vec3 } from './rig'

const POSE_INDEX = {
  Left: { shoulder: 11, elbow: 13, wrist: 15 },
  Right: { shoulder: 12, elbow: 14, wrist: 16 },
} as const

type Side = keyof typeof POSE_INDEX
export type MpPoint = { x: number; y: number; z: number; visibility?: number }

export type HandResult = {
  landmarks?: MpPoint[][]
  worldLandmarks?: MpPoint[][]
  handedness?: { categoryName?: string; score?: number }[][]
}

function mpToScene(point: MpPoint, mirror: boolean): Vec3 {
  return {
    x: mirror ? -point.x : point.x,
    y: -point.y,
    z: -point.z,
  }
}

function sourceSide(avatarSide: Side, mirror: boolean): Side {
  if (!mirror) return avatarSide
  return avatarSide === 'Left' ? 'Right' : 'Left'
}

function visible(points: MpPoint[] | undefined, index: number) {
  const value = points?.[index]?.visibility
  return value == null || value > 0.45
}

function armFromPose(
  world: MpPoint[],
  image: MpPoint[] | undefined,
  avatarSide: Side,
  mirror: boolean,
): ArmPose | null {
  const indexes = POSE_INDEX[sourceSide(avatarSide, mirror)]
  if (!visible(image, indexes.shoulder) || !visible(image, indexes.elbow) || !visible(image, indexes.wrist)) {
    return null
  }
  const shoulder = mpToScene(world[indexes.shoulder], mirror)
  const elbow = mpToScene(world[indexes.elbow], mirror)
  const wrist = mpToScene(world[indexes.wrist], mirror)
  const span = Math.hypot(elbow.x - shoulder.x, elbow.y - shoulder.y, elbow.z - shoulder.z)
  if (span < 0.05) return null
  return { shoulder, elbow, wrist, hand: null }
}

function headFromPose(world: MpPoint[], image: MpPoint[] | undefined, mirror: boolean): HeadPose | null {
  if (!visible(image, 0) || !visible(image, 7) || !visible(image, 8)) return null
  const leftEar = sourceSide('Left', mirror) === 'Left' ? 7 : 8
  const rightEar = sourceSide('Right', mirror) === 'Right' ? 8 : 7
  return {
    nose: mpToScene(world[0], mirror),
    leftEar: mpToScene(world[leftEar], mirror),
    rightEar: mpToScene(world[rightEar], mirror),
  }
}

/** Anatomical side of each detected hand, matched to the nearest pose wrist. */
export function assignHands(poseImage: MpPoint[] | undefined, hands: HandResult): Array<Side | null> {
  const points = hands.landmarks ?? []
  const leftWrist = poseImage?.[POSE_INDEX.Left.wrist]
  const rightWrist = poseImage?.[POSE_INDEX.Right.wrist]
  const label = (index: number): Side | null => {
    const name = hands.handedness?.[index]?.[0]?.categoryName
    return name === 'Left' || name === 'Right' ? name : null
  }
  if (!leftWrist || !rightWrist) return points.map((_, index) => label(index))

  const distance = (hand: MpPoint[], wrist: MpPoint) =>
    Math.hypot(hand[0].x - wrist.x, hand[0].y - wrist.y)
  if (points.length === 1) {
    return [distance(points[0], leftWrist) <= distance(points[0], rightWrist) ? 'Left' : 'Right']
  }
  if (points.length >= 2) {
    const straight = distance(points[0], leftWrist) + distance(points[1], rightWrist)
    const crossed = distance(points[0], rightWrist) + distance(points[1], leftWrist)
    const sides: Array<Side | null> = straight <= crossed ? ['Left', 'Right'] : ['Right', 'Left']
    return points.map((_, index) => sides[index] ?? null)
  }
  return []
}

export type SignLandmarkFrame = {
  poseWorld: number[][]
  poseImage: number[][]
  leftHandWorld: number[][] | null
  rightHandWorld: number[][] | null
}

export type SignLandmarkClip = {
  fps: number
  frames: SignLandmarkFrame[]
}

function asPoints(rows: number[][] | null | undefined): MpPoint[] | null {
  if (!rows?.length) return null
  return rows.map((row) => ({
    x: row[0] ?? 0,
    y: row[1] ?? 0,
    z: row[2] ?? 0,
    visibility: row[3],
  }))
}

/** Convert one precomputed Holistic frame into a BodyPose for AvatarRig. */
export function bodyPoseFromFrame(frame: SignLandmarkFrame, mirror = false): BodyPose {
  const world = asPoints(frame.poseWorld)
  const image = asPoints(frame.poseImage)
  const pose = {
    landmarks: image ? [image] : undefined,
    worldLandmarks: world ? [world] : undefined,
  }
  const left = asPoints(frame.leftHandWorld)
  const right = asPoints(frame.rightHandWorld)
  const hands: HandResult = {
    landmarks: [],
    worldLandmarks: [],
    handedness: [],
  }
  if (left) {
    hands.landmarks!.push(left)
    hands.worldLandmarks!.push(left)
    hands.handedness!.push([{ categoryName: 'Left', score: 1 }])
  }
  if (right) {
    hands.landmarks!.push(right)
    hands.worldLandmarks!.push(right)
    hands.handedness!.push([{ categoryName: 'Right', score: 1 }])
  }
  const handSides = hands.handedness!.map((h) => {
    const name = h[0]?.categoryName
    return name === 'Left' || name === 'Right' ? name : null
  })
  return toBodyPose(pose, hands, handSides, mirror)
}

export function toBodyPose(
  pose: { landmarks?: MpPoint[][]; worldLandmarks?: MpPoint[][] },
  hands: HandResult,
  handSides: Array<Side | null>,
  mirror = false,
): BodyPose {
  const world = pose.worldLandmarks?.[0]
  const image = pose.landmarks?.[0]
  const body: BodyPose = {
    left: world && world.length >= 17 ? armFromPose(world, image, 'Left', mirror) : null,
    right: world && world.length >= 17 ? armFromPose(world, image, 'Right', mirror) : null,
    head: world && world.length > 8 ? headFromPose(world, image, mirror) : null,
  }

  hands.worldLandmarks?.forEach((landmarks, index) => {
    const score = hands.handedness?.[index]?.[0]?.score ?? 1
    const detected = handSides[index]
    if (!detected || score < 0.5 || landmarks.length < 21) return
    const avatarSide = sourceSide(detected, mirror)
    const arm = avatarSide === 'Left' ? body.left : body.right
    if (!arm) return
    arm.hand = landmarks.map((point) => mpToScene(point, mirror))
  })

  return body
}

/** Serialize one live MediaPipe frame (same trackers as the mirror) for later replay. */
export function frameFromMediaPipe(
  pose: { landmarks?: MpPoint[][]; worldLandmarks?: MpPoint[][] },
  hands: HandResult,
  handSides: Array<Side | null>,
): SignLandmarkFrame | null {
  const world = pose.worldLandmarks?.[0]
  const image = pose.landmarks?.[0]
  if (!world?.length || !image?.length) return null

  let leftHandWorld: number[][] | null = null
  let rightHandWorld: number[][] | null = null
  hands.worldLandmarks?.forEach((lms, index) => {
    const side = handSides[index]
    if (!side || lms.length < 21) return
    const rows = lms.map((p) => [p.x, p.y, p.z])
    if (side === 'Left') leftHandWorld = rows
    else rightHandWorld = rows
  })

  return {
    poseWorld: world.map((p) => [p.x, p.y, p.z]),
    poseImage: image.map((p) => [p.x, p.y, p.z, p.visibility ?? 1]),
    leftHandWorld,
    rightHandWorld,
  }
}
