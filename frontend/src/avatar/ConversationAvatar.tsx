/**
 * ConversationAvatar — idle / live-mirror / landmark-replay for Rozmowy.
 */

import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
} from '@mediapipe/tasks-vision'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { ArmFilter, HeadFilter } from './filters'
import { AvatarRig, type BodyPose } from './rig'
import {
  assignHands,
  bodyPoseFromFrame,
  toBodyPose,
  type SignLandmarkClip,
} from './poseFromMediaPipe'

const AVATAR_URL = '/avatar_2_blendshapes.glb'
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm'
const POSE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

type MorphEntry = { mesh: THREE.SkinnedMesh; index: number }
type MorphMap = Map<string, MorphEntry[]>
type Trackers = { pose: PoseLandmarker; hands: HandLandmarker }

function buildMorphMap(scene: THREE.Object3D): MorphMap {
  const map: MorphMap = new Map()
  scene.traverse(obj => {
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

function setMorph(map: MorphMap, name: string, value: number) {
  const entries = map.get(name)
  if (!entries) return
  for (const { mesh, index } of entries) mesh.morphTargetInfluences![index] = value
}

function findBoneExact(scene: THREE.Object3D, name: string): THREE.Bone | null {
  let found: THREE.Bone | null = null
  scene.traverse(obj => {
    if (!found && obj instanceof THREE.Bone && obj.name === name) found = obj
  })
  return found
}

function findBone(scene: THREE.Object3D, name: string): THREE.Bone | null {
  let found: THREE.Bone | null = null
  const needle = name.toLowerCase()
  scene.traverse(obj => {
    if (!found && obj instanceof THREE.Bone && obj.name.toLowerCase().includes(needle)) {
      found = obj
    }
  })
  return found
}

function dropArmAlongSide(bone: THREE.Bone, side: 'Left' | 'Right') {
  const child = bone.children.find((c): c is THREE.Bone => c instanceof THREE.Bone)
  const parent = bone.parent
  if (!child || !parent) return
  const restDir = child.position.clone()
  if (restDir.lengthSq() < 1e-8) return
  restDir.normalize()
  parent.updateWorldMatrix(true, false)
  const parentInv = new THREE.Matrix4().copy(parent.matrixWorld).invert()
  const targetWorld = new THREE.Vector3(
    side === 'Left' ? 0.12 : -0.12,
    -1,
    0.02,
  ).normalize()
  const targetParent = targetWorld.clone().transformDirection(parentInv).normalize()
  bone.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(restDir, targetParent))
}

function bendElbow(fore: THREE.Bone) {
  const child = fore.children.find((c): c is THREE.Bone => c instanceof THREE.Bone)
  if (!child) return
  fore.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.45))
}

function applyIdleArmPose(scene: THREE.Object3D) {
  const leftArm = findBoneExact(scene, 'LeftArm')
  const rightArm = findBoneExact(scene, 'RightArm')
  const leftFore = findBoneExact(scene, 'LeftForeArm')
  const rightFore = findBoneExact(scene, 'RightForeArm')
  scene.updateMatrixWorld(true)
  if (leftArm) dropArmAlongSide(leftArm, 'Left')
  if (rightArm) dropArmAlongSide(rightArm, 'Right')
  if (leftFore) bendElbow(leftFore)
  if (rightFore) bendElbow(rightFore)
}

function breathe(t: number, freq: number, phase = 0) {
  return Math.sin(t * freq + phase)
}

type Props = {
  signing?: boolean
  /** Prefer this: drive avatar with the same MP+mirror path as the live studio. */
  signVideoUrl?: string | null
  /** Fallback: precomputed Holistic JSON (may not match studio mirroring). */
  landmarksUrl?: string | null
  durationMs?: number
  onSigningDone?: () => void
  /** Live selfie video — avatar mirrors it when liveTracking is true. */
  liveVideoRef?: RefObject<HTMLVideoElement | null>
  liveTracking?: boolean
  /** Sign-video playback speed. 1.5 ≈ 50% faster than recorded. */
  playbackRate?: number
}

type ReplayState = {
  clip: SignLandmarkClip
  index: number
  accum: number
} | null

export function ConversationAvatar({
  signing = false,
  signVideoUrl = null,
  landmarksUrl = null,
  durationMs = 2500,
  onSigningDone,
  liveVideoRef,
  liveTracking = false,
  playbackRate = 1.5,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const signVideoRef = useRef<HTMLVideoElement>(null)
  const onDoneRef = useRef(onSigningDone)
  const signingRef = useRef(false)
  const liveTrackingRef = useRef(false)
  const liveVideoPropRef = useRef(liveVideoRef)
  const playbackRateRef = useRef(playbackRate)
  const signVideoDrivingRef = useRef(false)
  const replayRef = useRef<ReplayState>(null)
  const restoreIdleRef = useRef<(() => void) | null>(null)
  const clipCache = useRef(new Map<string, SignLandmarkClip>())
  const [loading, setLoading] = useState(true)

  useEffect(() => { onDoneRef.current = onSigningDone }, [onSigningDone])
  useEffect(() => { signingRef.current = signing }, [signing])
  useEffect(() => { liveTrackingRef.current = liveTracking }, [liveTracking])
  useEffect(() => { liveVideoPropRef.current = liveVideoRef }, [liveVideoRef])
  useEffect(() => { playbackRateRef.current = playbackRate }, [playbackRate])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false
    let raf = 0
    let trackers: Trackers | null = null
    let lastTimestamp = -1

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    renderer.setClearColor(0x000000, 0)
    Object.assign(renderer.domElement.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block',
    })
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20)
    camera.position.set(0, 1.48, 1.55)
    camera.lookAt(0, 1.38, 0)
    scene.add(new THREE.HemisphereLight(0xffffff, 0xc5d0dc, 1.15))
    const key = new THREE.DirectionalLight(0xffffff, 1.7)
    key.position.set(0.7, 2.2, 1.8)
    scene.add(key)

    const resize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      if (!w || !h) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h, false)
    }
    resize()
    const obs = new ResizeObserver(resize)
    obs.observe(container)

    let morphMap: MorphMap = new Map()
    let headBone: THREE.Bone | null = null
    let neckBone: THREE.Bone | null = null
    let leftArm: THREE.Bone | null = null
    let rightArm: THREE.Bone | null = null
    let rootScene: THREE.Object3D | null = null
    let rig: AvatarRig | null = null
    const leftArmBase = new THREE.Euler()
    const rightArmBase = new THREE.Euler()
    const leftFilter = new ArmFilter()
    const rightFilter = new ArmFilter()
    const headFilter = new HeadFilter()
    let smoothed: BodyPose = { left: null, right: null, head: null }

    let blinkTimer = 2.5 + Math.random() * 2
    let blinkPhase = 0
    const BLINK_DUR = 0.12
    let lastT = performance.now() / 1000

    const captureIdleBases = () => {
      if (!rootScene) return
      applyIdleArmPose(rootScene)
      leftArm = findBoneExact(rootScene, 'LeftArm')
      rightArm = findBoneExact(rootScene, 'RightArm')
      if (leftArm) leftArmBase.copy(leftArm.rotation)
      if (rightArm) rightArmBase.copy(rightArm.rotation)
      leftFilter.filter(null, 1 / 60)
      rightFilter.filter(null, 1 / 60)
      headFilter.filter(null, 1 / 60)
      smoothed = { left: null, right: null, head: null }
    }
    restoreIdleRef.current = captureIdleBases

    const finishReplay = () => {
      replayRef.current = null
      captureIdleBases()
      onDoneRef.current?.()
    }

    const applyBody = (body: BodyPose, dt: number) => {
      if (!rig) return
      smoothed = {
        left: leftFilter.filter(body.left, dt),
        right: rightFilter.filter(body.right, dt),
        head: headFilter.filter(body.head, dt),
      }
      if (smoothed.left || smoothed.right || smoothed.head) rig.apply(smoothed, dt)
    }

    const tick = (nowMs: number) => {
      raf = requestAnimationFrame(tick)
      const now = nowMs / 1000
      const dt = Math.min(0.05, now - lastT)
      lastT = now

      if (!rootScene) {
        renderer.render(scene, camera)
        return
      }

      const replay = replayRef.current
      const replayingJson = signingRef.current && !!replay && !!rig && !signVideoDrivingRef.current
      const signVideo = signVideoRef.current
      const drivingSignVideo =
        signingRef.current &&
        signVideoDrivingRef.current &&
        !!trackers &&
        !!rig &&
        !!signVideo &&
        !signVideo.paused &&
        !signVideo.ended &&
        signVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        signVideo.videoWidth > 0
      const liveVideo = liveVideoPropRef.current?.current ?? null
      const mirroring =
        !replayingJson &&
        !drivingSignVideo &&
        liveTrackingRef.current &&
        !!trackers &&
        !!rig &&
        !!liveVideo &&
        !liveVideo.paused &&
        liveVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        liveVideo.videoWidth > 0

      const driveFromVideo = (video: HTMLVideoElement) => {
        rootScene!.rotation.y = 0
        rootScene!.rotation.z = 0
        const timestamp = nowMs <= lastTimestamp ? lastTimestamp + 1 : nowMs
        lastTimestamp = timestamp
        try {
          const pose = trackers!.pose.detectForVideo(video, timestamp)
          const hands = trackers!.hands.detectForVideo(video, timestamp)
          const handSides = assignHands(pose.landmarks?.[0], hands)
          // Same selfie-mirror mapping as the live studio.
          applyBody(toBodyPose(pose, hands, handSides, true), dt)
        } catch {
          // duplicate timestamp — ignore
        }
      }

      if (drivingSignVideo && signVideo) {
        driveFromVideo(signVideo)
      } else if (replayingJson && replay && rig) {
        rootScene.rotation.y = 0
        rootScene.rotation.z = 0
        const rate = Math.max(0.1, playbackRateRef.current)
        const frameDt = 1 / Math.max(1, replay.clip.fps * rate)
        replay.accum += dt
        while (replay.accum >= frameDt) {
          replay.accum -= frameDt
          replay.index += 1
        }
        if (replay.index >= replay.clip.frames.length) {
          finishReplay()
        } else {
          // Selfie samples need the same mirror flag as live tracking.
          applyBody(bodyPoseFromFrame(replay.clip.frames[replay.index], true), dt)
        }
      } else if (mirroring && liveVideo) {
        driveFromVideo(liveVideo)
      } else {
        rootScene.rotation.y =
          breathe(now, 0.31, 0.0) * 0.06 + breathe(now, 0.17, 1.1) * 0.02
        rootScene.rotation.z =
          breathe(now, 0.23, 0.5) * 0.012 + breathe(now, 0.11, 2.3) * 0.005
        if (leftArm) {
          leftArm.rotation.set(
            leftArmBase.x + breathe(now, 0.22, 0.4) * 0.02,
            leftArmBase.y,
            leftArmBase.z + breathe(now, 0.18, 1.0) * 0.015,
          )
        }
        if (rightArm) {
          rightArm.rotation.set(
            rightArmBase.x + breathe(now, 0.22, 0.4 + Math.PI) * 0.02,
            rightArmBase.y,
            rightArmBase.z + breathe(now, 0.18, 1.0 + Math.PI) * 0.015,
          )
        }
        if (headBone) {
          headBone.rotation.x = breathe(now, 0.19, 0.8) * 0.04 + breathe(now, 0.43, 1.7) * 0.015
          headBone.rotation.y = breathe(now, 0.27, 0.3) * 0.08 + breathe(now, 0.13, 2.1) * 0.03
          headBone.rotation.z = breathe(now, 0.21, 1.2) * 0.03
        }
        if (neckBone) {
          neckBone.rotation.y = breathe(now, 0.27, 0.3) * 0.03
          neckBone.rotation.x = breathe(now, 0.19, 0.8) * 0.015
        }
      }

      const eyeR = Math.max(0, breathe(now, 0.33, 0.9) * 0.06)
      const eyeL = Math.max(0, breathe(now, 0.33, 0.9 + Math.PI) * 0.06)
      setMorph(morphMap, 'eyeLookOutLeft', eyeL)
      setMorph(morphMap, 'eyeLookInLeft', 0)
      setMorph(morphMap, 'eyeLookOutRight', eyeR)
      setMorph(morphMap, 'eyeLookInRight', 0)
      const eyeDown = Math.max(0, breathe(now, 0.41, 1.4) * 0.05)
      setMorph(morphMap, 'eyeLookDownLeft', eyeDown)
      setMorph(morphMap, 'eyeLookDownRight', eyeDown)

      blinkTimer -= dt
      if (blinkTimer <= 0 && blinkPhase === 0) {
        blinkPhase = BLINK_DUR
        blinkTimer = 2.5 + Math.random() * 3
      }
      if (blinkPhase > 0) {
        blinkPhase -= dt
        const progress = blinkPhase / BLINK_DUR
        const blink = progress < 0.5 ? progress / 0.5 : (1 - progress) / 0.5
        setMorph(morphMap, 'eyeBlinkLeft', blink)
        setMorph(morphMap, 'eyeBlinkRight', blink)
        if (blinkPhase <= 0) {
          blinkPhase = 0
          setMorph(morphMap, 'eyeBlinkLeft', 0)
          setMorph(morphMap, 'eyeBlinkRight', 0)
        }
      }
      const smile = 0.12 + breathe(now, 0.09, 0.6) * 0.04
      setMorph(morphMap, 'mouthSmileLeft', smile)
      setMorph(morphMap, 'mouthSmileRight', smile)

      renderer.render(scene, camera)
    }

    void (async () => {
      try {
        const gltf = await new GLTFLoader().loadAsync(AVATAR_URL)
        if (cancelled) return
        gltf.scene.position.y = -0.12
        scene.add(gltf.scene)
        rootScene = gltf.scene
        rig = new AvatarRig(gltf.scene)
        morphMap = buildMorphMap(gltf.scene)
        headBone = findBone(gltf.scene, 'Head')
        neckBone = findBone(gltf.scene, 'Neck')
        captureIdleBases()

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

        setLoading(false)
        raf = requestAnimationFrame(tick)
      } catch {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      obs.disconnect()
      trackers?.pose.close()
      trackers?.hands.close()
      renderer.dispose()
      renderer.domElement.remove()
      restoreIdleRef.current = null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const el = signVideoRef.current

    if (!signing) {
      replayRef.current = null
      signVideoDrivingRef.current = false
      if (el) {
        el.pause()
        el.removeAttribute('src')
        el.load()
      }
      if (!liveTracking) restoreIdleRef.current?.()
      return
    }

    // Prefer the recorded webm through the same MP pipeline as live mirror.
    if (signVideoUrl && el) {
      let finished = false
      const finish = () => {
        if (finished) return
        finished = true
        signVideoDrivingRef.current = false
        el.pause()
        restoreIdleRef.current?.()
        onDoneRef.current?.()
      }
      el.src = signVideoUrl
      el.playbackRate = Math.max(0.1, playbackRate)
      el.currentTime = 0
      el.addEventListener('ended', finish)
      signVideoDrivingRef.current = true
      void el.play().catch(() => finish())
      return () => {
        cancelled = true
        el.removeEventListener('ended', finish)
        signVideoDrivingRef.current = false
        el.pause()
      }
    }

    if (!landmarksUrl) {
      const id = setTimeout(() => onDoneRef.current?.(), durationMs)
      return () => clearTimeout(id)
    }

    void (async () => {
      try {
        let clip = clipCache.current.get(landmarksUrl)
        if (!clip) {
          const res = await fetch(landmarksUrl)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          clip = (await res.json()) as SignLandmarkClip
          clipCache.current.set(landmarksUrl, clip)
        }
        if (!cancelled) replayRef.current = { clip, index: 0, accum: 0 }
      } catch {
        if (!cancelled) onDoneRef.current?.()
      }
    })()
    return () => { cancelled = true }
  }, [signing, signVideoUrl, landmarksUrl, durationMs, liveTracking, playbackRate])

  return (
    <div className="conversation-avatar-wrap">
      <div className="conversation-avatar" ref={containerRef} />
      <video
        ref={signVideoRef}
        className="conversation-avatar__sign-video"
        muted
        playsInline
        preload="auto"
        crossOrigin="anonymous"
      />
      {loading && (
        <div className="conversation-avatar__loading">
          <span className="spinner" />
        </div>
      )}
    </div>
  )
}
