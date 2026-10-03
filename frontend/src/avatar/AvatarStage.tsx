import { useEffect, useRef, useState } from 'react'
import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
} from '@mediapipe/tasks-vision'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { AvatarRig, type ArmPose, type BodyPose, type Vec3 } from './rig'

const AVATAR_URL = encodeURI('/character-avatar/source/MAXMUD Avatar.glb')
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm'
const POSE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

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
}

function mpToScene(point: MpPoint): Vec3 {
  return {
    x: MIRROR ? -point.x : point.x,
    y: -point.y,
    z: -point.z,
  }
}

// Hand world landmarks point +Z toward the camera. Pose landmarks use the opposite depth sign.
function mpHandToScene(point: MpPoint): Vec3 {
  const scene = mpToScene(point)
  scene.z = -scene.z
  return scene
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

function toBodyPose(
  pose: { landmarks?: MpPoint[][]; worldLandmarks?: MpPoint[][] },
  hands: {
    worldLandmarks?: MpPoint[][]
    handedness?: { categoryName?: string; score?: number }[][]
  },
): BodyPose {
  const world = pose.worldLandmarks?.[0]
  const image = pose.landmarks?.[0]
  const body: BodyPose = {
    left: world && world.length >= 17 ? armFromPose(world, image, 'Left') : null,
    right: world && world.length >= 17 ? armFromPose(world, image, 'Right') : null,
  }

  hands.worldLandmarks?.forEach((landmarks, index) => {
    const label = hands.handedness?.[index]?.[0]
    if (!label || (label.score ?? 1) < 0.5 || landmarks.length < 21) return
    const detected = label.categoryName === 'Left' || label.categoryName === 'Right' ? label.categoryName : null
    if (!detected) return
    const avatarSide = sourceSide(detected)
    const arm = avatarSide === 'Left' ? body.left : body.right
    if (!arm) return
    arm.hand = landmarks.map((point) => mpHandToScene(point))
  })

  return body
}

function mix(a: Vec3, b: Vec3, amount: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * amount,
    y: a.y + (b.y - a.y) * amount,
    z: a.z + (b.z - a.z) * amount,
  }
}

function smoothArm(previous: ArmPose | null, next: ArmPose | null): ArmPose | null {
  if (!next) return null
  if (!previous) return next
  const amount = 0.62
  const hand =
    next.hand && previous.hand && previous.hand.length === next.hand.length
      ? next.hand.map((point, index) => mix(previous.hand![index], point, amount))
      : next.hand
  return {
    shoulder: mix(previous.shoulder, next.shoulder, amount),
    elbow: mix(previous.elbow, next.elbow, amount),
    wrist: mix(previous.wrist, next.wrist, amount),
    hand,
  }
}

export default function AvatarStage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackersRef = useRef<Trackers | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [ready, setReady] = useState(false)
  const [tracking, setTracking] = useState(false)
  const [message, setMessage] = useState('Loading avatar and pose tracking…')
  const [cameraError, setCameraError] = useState<string | null>(null)

  useEffect(() => {
    const container = containerRef.current
    const video = videoRef.current
    if (!container || !video) return

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
    let smoothed: BodyPose = { left: null, right: null }
    let lastTimestamp = -1

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const trackers = trackersRef.current
      if (rig && trackers && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
        const timestamp = now <= lastTimestamp ? lastTimestamp + 1 : now
        lastTimestamp = timestamp
        try {
          const pose = trackers.pose.detectForVideo(video, timestamp)
          const hands = trackers.hands.detectForVideo(video, timestamp)
          const body = toBodyPose(pose, hands)
          smoothed = {
            left: smoothArm(smoothed.left, body.left),
            right: smoothArm(smoothed.right, body.right),
          }
          if (smoothed.left || smoothed.right) rig.apply(smoothed)
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
          const [pose, hands] = await Promise.all([
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
          ])
          return { pose, hands }
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
          return
        }
        trackersRef.current = trackers
        track(() => {
          trackers.pose.close()
          trackers.hands.close()
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
      <div className="stage" ref={containerRef}>
        <video ref={videoRef} className={tracking ? 'preview preview--live' : 'preview'} playsInline muted />
        {!tracking && (
          <div className="stage-overlay">
            <p>{cameraError ?? message}</p>
            <button type="button" onClick={() => void startCamera()} disabled={!ready}>
              Use my camera
            </button>
          </div>
        )}
      </div>
      {tracking && <p className="hint">{message} Video stays on this device.</p>}
    </section>
  )
}
