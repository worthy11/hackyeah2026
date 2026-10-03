import { useEffect, useRef, useState } from 'react'
import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
} from '@mediapipe/tasks-vision'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { ArmFilter, HeadFilter } from './filters'
import { AvatarRig, type ArmPose, type BodyPose, type HeadPose, type Vec3 } from './rig'

const AVATAR_URL = '/avatar_2_blendshapes.glb'
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm'
const POSE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

/** Mirror the pose so the avatar matches the flipped preview. */
const MIRROR = true

const POSE_INDEX = {
  Left: { shoulder: 11, elbow: 13, wrist: 15 },
  Right: { shoulder: 12, elbow: 14, wrist: 16 },
} as const

type Side = keyof typeof POSE_INDEX
type MpPoint = { x: number; y: number; z: number; visibility?: number }

type Trackers = {
  pose: PoseLandmarker
  hands: HandLandmarker
  face: FaceLandmarker
}

// ── Blendshape / morph target helpers ────────────────────────────────────────

type MorphEntry = { mesh: THREE.SkinnedMesh; index: number }
type MorphMap = Map<string, MorphEntry[]>
type FaceBlendshapes = { categories: { categoryName: string; score: number }[] }[]

function buildMorphMap(scene: THREE.Object3D): MorphMap {
  const map = new Map<string, MorphEntry[]>()
  scene.traverse((obj) => {
    const mesh = obj as THREE.SkinnedMesh
    if (!mesh.isSkinnedMesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return
    for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
      const list = map.get(name) ?? []
      list.push({ mesh, index })
      map.set(name, list)
    }
  })
  return map
}

function applyBlendshapes(morphMap: MorphMap, blendshapes: FaceBlendshapes) {
  if (!blendshapes.length) {
    // No face detected — reset all to rest
    for (const entries of morphMap.values()) {
      for (const { mesh, index } of entries) mesh.morphTargetInfluences![index] = 0
    }
    return
  }
  for (const { categoryName, score } of blendshapes[0].categories) {
    const entries = morphMap.get(categoryName)
    if (!entries) continue
    for (const { mesh, index } of entries) mesh.morphTargetInfluences![index] = score
  }
}

function mpToScene(point: MpPoint): Vec3 {
  return {
    x: MIRROR ? -point.x : point.x,
    y: -point.y,
    z: -point.z,
  }
}

function sourceSide(avatarSide: Side): Side {
  if (!MIRROR) return avatarSide
  return avatarSide === 'Left' ? 'Right' : 'Left'
}

function visible(points: MpPoint[] | undefined, index: number) {
  const value = points?.[index]?.visibility
  return value == null || value > 0.45
}

function armFromPose(world: MpPoint[], image: MpPoint[] | undefined, avatarSide: Side): ArmPose | null {
  const indexes = POSE_INDEX[sourceSide(avatarSide)]
  if (!visible(image, indexes.shoulder) || !visible(image, indexes.elbow) || !visible(image, indexes.wrist)) {
    return null
  }
  const shoulder = mpToScene(world[indexes.shoulder])
  const elbow = mpToScene(world[indexes.elbow])
  const wrist = mpToScene(world[indexes.wrist])
  const span = Math.hypot(elbow.x - shoulder.x, elbow.y - shoulder.y, elbow.z - shoulder.z)
  if (span < 0.05) return null
  return { shoulder, elbow, wrist, hand: null }
}

function headFromPose(world: MpPoint[], image: MpPoint[] | undefined): HeadPose | null {
  if (!visible(image, 0) || !visible(image, 7) || !visible(image, 8)) return null
  const leftEar = sourceSide('Left') === 'Left' ? 7 : 8
  const rightEar = sourceSide('Right') === 'Right' ? 8 : 7
  return {
    nose: mpToScene(world[0]),
    leftEar: mpToScene(world[leftEar]),
    rightEar: mpToScene(world[rightEar]),
  }
}

type HandResult = {
  landmarks?: MpPoint[][]
  worldLandmarks?: MpPoint[][]
  handedness?: { categoryName?: string; score?: number }[][]
}

/** Anatomical side of each detected hand, matched to the nearest pose wrist. Handedness labels flip too often to trust. */
function assignHands(poseImage: MpPoint[] | undefined, hands: HandResult): Array<Side | null> {
  const points = hands.landmarks ?? []
  const leftWrist = poseImage?.[POSE_INDEX.Left.wrist]
  const rightWrist = poseImage?.[POSE_INDEX.Right.wrist]
  const label = (index: number): Side | null => {
    const name = hands.handedness?.[index]?.[0]?.categoryName
    return name === 'Left' || name === 'Right' ? name : null
  }
  if (!leftWrist || !rightWrist) return points.map((_, index) => label(index))

  const distance = (hand: MpPoint[], wrist: MpPoint) => Math.hypot(hand[0].x - wrist.x, hand[0].y - wrist.y)
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

function toBodyPose(
  pose: { landmarks?: MpPoint[][]; worldLandmarks?: MpPoint[][] },
  hands: HandResult,
  handSides: Array<Side | null>,
): BodyPose {
  const world = pose.worldLandmarks?.[0]
  const image = pose.landmarks?.[0]
  const body: BodyPose = {
    left: world && world.length >= 17 ? armFromPose(world, image, 'Left') : null,
    right: world && world.length >= 17 ? armFromPose(world, image, 'Right') : null,
    head: world && world.length > 8 ? headFromPose(world, image) : null,
  }

  hands.worldLandmarks?.forEach((landmarks, index) => {
    const score = hands.handedness?.[index]?.[0]?.score ?? 1
    const detected = handSides[index]
    if (!detected || score < 0.5 || landmarks.length < 21) return
    const avatarSide = sourceSide(detected)
    const arm = avatarSide === 'Left' ? body.left : body.right
    if (!arm) return
    arm.hand = landmarks.map((point) => mpToScene(point))
  })

  return body
}

function holdHead(next: HeadPose | null, previous: HeadPose | null, missed: number) {
  if (next) return { head: next, missed: 0 }
  if (previous && missed < 6) return { head: previous, missed: missed + 1 }
  return { head: null, missed: missed + 1 }
}

const POSE_LINKS: Array<[number, number]> = [
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 12],
]

const FACE_LINKS: Array<[number, number]> = [
  [7, 8],
  [0, 7],
  [0, 8],
]

const HAND_LINKS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 13], [13, 17],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
]

function drawOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  pose: { landmarks?: MpPoint[][] },
  hands: HandResult,
  handSides: Array<Side | null>,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx || video.videoWidth === 0) return
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const body = pose.landmarks?.[0]
  if (body) {
    drawLinks(ctx, body, FACE_LINKS, '#ddd6fe', canvas.width, canvas.height)
    drawLinks(ctx, body, POSE_LINKS, '#67e8f9', canvas.width, canvas.height)
    labelPoint(ctx, body[15], 'L', '#67e8f9', canvas.width, canvas.height)
    labelPoint(ctx, body[16], 'R', '#67e8f9', canvas.width, canvas.height)
  }

  hands.landmarks?.forEach((points, index) => {
    const name = handSides[index]
    const color = name === 'Left' ? '#fbbf24' : '#86efac'
    drawLinks(ctx, points, HAND_LINKS, color, canvas.width, canvas.height)
    labelPoint(ctx, points[0], name === 'Left' ? 'left' : 'right', color, canvas.width, canvas.height)
  })
}

function mirrorX(point: MpPoint, width: number) {
  return (1 - point.x) * width
}

function drawLinks(
  ctx: CanvasRenderingContext2D,
  points: MpPoint[],
  links: Array<[number, number]>,
  color: string,
  width: number,
  height: number,
) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = Math.max(2, width * 0.004)
  ctx.beginPath()
  for (const [start, end] of links) {
    const from = points[start]
    const to = points[end]
    if (!from || !to || !visible(points, start) || !visible(points, end)) continue
    ctx.moveTo(mirrorX(from, width), from.y * height)
    ctx.lineTo(mirrorX(to, width), to.y * height)
  }
  ctx.stroke()

  const seen = new Set<number>()
  for (const [start, end] of links) {
    seen.add(start)
    seen.add(end)
  }
  for (const index of seen) {
    const point = points[index]
    if (!point || !visible(points, index)) continue
    ctx.beginPath()
    ctx.arc(mirrorX(point, width), point.y * height, Math.max(3, width * 0.008), 0, Math.PI * 2)
    ctx.fill()
  }
}

function labelPoint(
  ctx: CanvasRenderingContext2D,
  point: MpPoint | undefined,
  text: string,
  color: string,
  width: number,
  height: number,
) {
  if (!point) return
  ctx.fillStyle = color
  ctx.font = `bold ${Math.max(14, Math.round(width * 0.045))}px sans-serif`
  ctx.fillText(text, mirrorX(point, width) + 8, point.y * height - 8)
}

type HoldState = { arm: number; hand: number; jump: number }

const ARM_HOLD_FRAMES = 6
const HAND_HOLD_FRAMES = 8
const JUMP_HOLD_FRAMES = 4
const JUMP_DISTANCE = 0.3

function distance(a: Vec3, b: Vec3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

/** Rides out short dropouts and single-frame landmark jumps instead of snapping the arm. */
function holdArm(next: ArmPose | null, previous: ArmPose | null, state: HoldState): ArmPose | null {
  if (!next) {
    state.arm += 1
    return previous && state.arm <= ARM_HOLD_FRAMES ? previous : null
  }
  state.arm = 0

  if (previous && (distance(next.wrist, previous.wrist) > JUMP_DISTANCE || distance(next.elbow, previous.elbow) > JUMP_DISTANCE)) {
    state.jump += 1
    if (state.jump <= JUMP_HOLD_FRAMES) return previous
  }
  state.jump = 0

  if (next.hand) {
    state.hand = 0
    return next
  }
  state.hand += 1
  if (previous?.hand && state.hand <= HAND_HOLD_FRAMES) return { ...next, hand: previous.hand }
  return next
}

export default function AvatarStage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const trackersRef = useRef<Trackers | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [ready, setReady] = useState(false)
  const [tracking, setTracking] = useState(false)
  const [message, setMessage] = useState('Loading avatar and pose tracking…')
  const [cameraError, setCameraError] = useState<string | null>(null)

  useEffect(() => {
    const container = containerRef.current
    const video = videoRef.current
    const overlay = overlayRef.current
    if (!container || !video || !overlay) return

    let cancelled = false
    let raf = 0
    const cleanups: Array<() => void> = []
    const track = (cleanup: () => void) => {
      if (cancelled) cleanup()
      else cleanups.push(cleanup)
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    renderer.setClearColor(0xd5dee8)
    container.appendChild(renderer.domElement)
    track(() => {
      cancelAnimationFrame(raf)
      renderer.dispose()
      renderer.domElement.remove()
    })

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20)
    camera.position.set(0, 1.4, 1.85)
    camera.lookAt(0, 1.32, 0)

    scene.add(new THREE.HemisphereLight(0xffffff, 0xc5d0dc, 1.15))
    const key = new THREE.DirectionalLight(0xffffff, 1.7)
    key.position.set(0.7, 2.2, 1.8)
    scene.add(key)

    const resize = () => {
      const width = container.clientWidth
      const height = container.clientHeight
      if (width === 0 || height === 0) return
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    track(() => observer.disconnect())

    let rig: AvatarRig | null = null
    let morphMap: MorphMap = new Map()
    let smoothed: BodyPose = { left: null, right: null, head: null }
    const leftFilter = new ArmFilter()
    const rightFilter = new ArmFilter()
    const headFilter = new HeadFilter()
    const leftHold: HoldState = { arm: 0, hand: 0, jump: 0 }
    const rightHold: HoldState = { arm: 0, hand: 0, jump: 0 }
    let headMiss = 0
    let lastTimestamp = -1
    let lastFrame = performance.now()

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000))
      lastFrame = now
      const trackers = trackersRef.current
      if (rig && trackers && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
        const timestamp = now <= lastTimestamp ? lastTimestamp + 1 : now
        lastTimestamp = timestamp
        try {
          const pose = trackers.pose.detectForVideo(video, timestamp)
          const hands = trackers.hands.detectForVideo(video, timestamp)
          const faceResult = trackers.face.detectForVideo(video, timestamp)
          const handSides = assignHands(pose.landmarks?.[0], hands)
          drawOverlay(overlay, video, pose, hands, handSides)
          const body = toBodyPose(pose, hands, handSides)
          const left = holdArm(body.left, smoothed.left, leftHold)
          const right = holdArm(body.right, smoothed.right, rightHold)
          const heldHead = holdHead(body.head, smoothed.head, headMiss)
          headMiss = heldHead.missed
          smoothed = {
            left: leftFilter.filter(left, dt),
            right: rightFilter.filter(right, dt),
            head: headFilter.filter(heldHead.head, dt),
          }
          if (smoothed.left || smoothed.right || smoothed.head) rig.apply(smoothed, dt)
          applyBlendshapes(morphMap, faceResult.faceBlendshapes ?? [])
        } catch {
          // A skipped video frame can repeat a timestamp. The next frame recovers.
        }
      }
      renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(loop)

    void (async () => {
      try {
        const gltf = await new GLTFLoader().loadAsync(AVATAR_URL)
        if (cancelled) return

        scene.add(gltf.scene)
        rig = new AvatarRig(gltf.scene)
        morphMap = buildMorphMap(gltf.scene)
        track(() => {
          gltf.scene.traverse((object) => {
            const mesh = object as THREE.Mesh
            if (!mesh.isMesh) return
            mesh.geometry?.dispose()
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            materials.forEach((material) => material.dispose())
          })
        })

        const vision = await FilesetResolver.forVisionTasks(WASM_URL)
        if (cancelled) return

        const create = async (delegate: 'GPU' | 'CPU') => {
          const base = { modelAssetPath: '', delegate }
          const [pose, hands, face] = await Promise.all([
            PoseLandmarker.createFromOptions(vision, {
              baseOptions: { ...base, modelAssetPath: POSE_MODEL },
              runningMode: 'VIDEO',
              numPoses: 1,
            }),
            HandLandmarker.createFromOptions(vision, {
              baseOptions: { ...base, modelAssetPath: HAND_MODEL },
              runningMode: 'VIDEO',
              numHands: 2,
            }),
            FaceLandmarker.createFromOptions(vision, {
              baseOptions: { ...base, modelAssetPath: FACE_MODEL },
              runningMode: 'VIDEO',
              numFaces: 1,
              outputFaceBlendshapes: true,
            }),
          ])
          return { pose, hands, face }
        }

        let trackers: Trackers
        try {
          trackers = await create('GPU')
        } catch {
          trackers = await create('CPU')
        }
        if (cancelled) {
          trackers.pose.close()
          trackers.hands.close()
          trackers.face.close()
          return
        }
        trackersRef.current = trackers
        track(() => {
          trackers.pose.close()
          trackers.hands.close()
          trackers.face.close()
          trackersRef.current = null
        })
        setReady(true)
        setMessage('Allow the camera, then raise a hand.')
      } catch (err) {
        if (cancelled) return
        setMessage(err instanceof Error ? err.message : 'Could not start pose tracking')
      }
    })()

    return () => {
      cancelled = true
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [])

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((mediaTrack) => mediaTrack.stop())
    }
  }, [])

  async function startCamera() {
    const video = videoRef.current
    if (!video || !trackersRef.current) return
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      })
      streamRef.current?.getTracks().forEach((mediaTrack) => mediaTrack.stop())
      streamRef.current = stream
      video.srcObject = stream
      await video.play()
      setTracking(true)
      setMessage('Tracking. The preview is mirrored.')
    } catch (err) {
      const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
      setCameraError(denied ? 'Camera permission was blocked.' : 'No camera is available.')
      setTracking(false)
    }
  }

  return (
    <section className="stage-wrap">
      <div className="stage-row">
        <div className="stage" ref={containerRef}>
          {!tracking && (
            <div className="stage-overlay">
              <p>{cameraError ?? message}</p>
              <button type="button" onClick={() => void startCamera()} disabled={!ready}>
                Use my camera
              </button>
            </div>
          )}
        </div>
        <div className={tracking ? 'preview-frame preview-frame--live' : 'preview-frame'}>
          <video ref={videoRef} className="preview" playsInline muted />
          <canvas ref={overlayRef} className="preview-overlay" />
        </div>
      </div>
      {tracking && (
        <p className="hint">
          Violet marks the face, cyan the arms. Yellow is the left hand, green is the right. Video stays on this device.
        </p>
      )}
    </section>
  )
}
