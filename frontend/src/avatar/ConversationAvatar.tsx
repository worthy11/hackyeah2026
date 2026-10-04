/**
 * ConversationAvatar — idle / live-mirror / landmark-replay for Rozmowy.
 */

import { useEffect, useImperativeHandle, useRef, useState, forwardRef, type RefObject } from 'react'
import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
} from '@mediapipe/tasks-vision'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { ArmFilter, HeadFilter } from './filters'
import { AvatarRig, type ArmPose, type BodyPose, type HeadPose, type Vec3 } from './rig'
import {
  assignHands,
  bodyPoseFromFrame,
  frameFromMediaPipe,
  toBodyPose,
  type SignLandmarkClip,
  type SignLandmarkFrame,
} from './poseFromMediaPipe'
import {
  applyScriptedHello,
  captureScriptedArmBases,
  SCRIPTED_HELLO_DURATION_S,
  type ScriptedArmBases,
  type ScriptedArmBones,
} from './scriptedHello'

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

  if (
    previous &&
    (distance(next.wrist, previous.wrist) > JUMP_DISTANCE ||
      distance(next.elbow, previous.elbow) > JUMP_DISTANCE)
  ) {
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

function holdHead(next: HeadPose | null, previous: HeadPose | null, missed: number) {
  if (next) return { head: next, missed: 0 }
  if (previous && missed < 6) return { head: previous, missed: missed + 1 }
  return { head: null, missed: missed + 1 }
}

type Props = {
  signing?: boolean
  /** Prefer this: drive avatar with the same MP+mirror path as the live studio. */
  signVideoUrl?: string | null
  /** Fallback: precomputed Holistic JSON (may not match studio mirroring). */
  landmarksUrl?: string | null
  /** Hardcoded keypoint choreography (conversation demo). */
  scriptedSign?: 'hello' | null
  /** Load MediaPipe trackers (needed for live mirror / sign-video). Off for scripted chat. */
  loadTrackers?: boolean
  durationMs?: number
  onSigningDone?: () => void
  /** Live selfie video — avatar mirrors it when liveTracking is true. */
  liveVideoRef?: RefObject<HTMLVideoElement | null>
  liveTracking?: boolean
  /** Sign-video playback speed. 1.5 ≈ 50% faster than recorded. */
  playbackRate?: number
}

export type ConversationAvatarHandle = {
  startLandmarkCapture: () => void
  stopLandmarkCapture: () => SignLandmarkClip | null
}

type ReplayState = {
  clip: SignLandmarkClip
  index: number
  accum: number
} | null

type ScriptedState = {
  id: 'hello'
  t: number
  bones: ScriptedArmBones
  bases: ScriptedArmBases
} | null

type CaptureBuf = {
  active: boolean
  frames: SignLandmarkFrame[]
  t0: number
  tLast: number
}

export const ConversationAvatar = forwardRef<ConversationAvatarHandle, Props>(function ConversationAvatar({
  signing = false,
  signVideoUrl = null,
  landmarksUrl = null,
  scriptedSign = null,
  loadTrackers = true,
  durationMs = 2500,
  onSigningDone,
  liveVideoRef,
  liveTracking = false,
  playbackRate = 1.5,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const signVideoRef = useRef<HTMLVideoElement>(null)
  const onDoneRef = useRef(onSigningDone)
  const signingRef = useRef(false)
  const liveTrackingRef = useRef(false)
  const liveVideoPropRef = useRef(liveVideoRef)
  const playbackRateRef = useRef(playbackRate)
  const signVideoDrivingRef = useRef(false)
  const trackersReadyRef = useRef(false)
  const replayRef = useRef<ReplayState>(null)
  const scriptedRef = useRef<ScriptedState>(null)
  const scriptedBonesRef = useRef<ScriptedArmBones | null>(null)
  const scriptedBasesRef = useRef<ScriptedArmBases | null>(null)
  const restoreIdleRef = useRef<(() => void) | null>(null)
  const clipCache = useRef(new Map<string, SignLandmarkClip>())
  const captureRef = useRef<CaptureBuf>({ active: false, frames: [], t0: 0, tLast: 0 })
  const [loading, setLoading] = useState(true)

  useImperativeHandle(ref, () => ({
    startLandmarkCapture: () => {
      captureRef.current = { active: true, frames: [], t0: 0, tLast: 0 }
    },
    stopLandmarkCapture: () => {
      const buf = captureRef.current
      buf.active = false
      if (buf.frames.length < 2) return null
      const elapsed = Math.max(1, buf.tLast - buf.t0) / 1000
      const fps = Math.min(60, Math.max(8, buf.frames.length / elapsed))
      return { fps, frames: buf.frames }
    },
  }))

  useEffect(() => { onDoneRef.current = onSigningDone }, [onSigningDone])
  useEffect(() => { signingRef.current = signing }, [signing])
  useEffect(() => { liveTrackingRef.current = liveTracking }, [liveTracking])
  useEffect(() => { liveVideoPropRef.current = liveVideoRef }, [liveVideoRef])
  useEffect(() => { playbackRateRef.current = playbackRate }, [playbackRate])

  const loadTrackersRef = useRef(loadTrackers)
  useEffect(() => { loadTrackersRef.current = loadTrackers }, [loadTrackers])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false
    let raf = 0
    let trackers: Trackers | null = null
    let lastTimestamp = -1
    trackersReadyRef.current = false

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
    const leftHold: HoldState = { arm: 0, hand: 0, jump: 0 }
    const rightHold: HoldState = { arm: 0, hand: 0, jump: 0 }
    let headMiss = 0
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
      leftHold.arm = leftHold.hand = leftHold.jump = 0
      rightHold.arm = rightHold.hand = rightHold.jump = 0
      headMiss = 0
      smoothed = { left: null, right: null, head: null }

      const leftArmBone = leftArm || findBone(rootScene, 'LeftArm')
      const rightArmBone = rightArm || findBone(rootScene, 'RightArm')
      const leftFore = findBoneExact(rootScene, 'LeftForeArm') || findBone(rootScene, 'LeftForeArm')
      const rightFore = findBoneExact(rootScene, 'RightForeArm') || findBone(rootScene, 'RightForeArm')
      const rightHand = findBoneExact(rootScene, 'RightHand') || findBone(rootScene, 'RightHand')
      if (leftArmBone && rightArmBone && leftFore && rightFore) {
        leftArm = leftArmBone
        rightArm = rightArmBone
        const bones: ScriptedArmBones = {
          rightArm: rightArmBone,
          rightFore,
          rightHand,
          leftArm: leftArmBone,
          leftFore,
        }
        scriptedBonesRef.current = bones
        scriptedBasesRef.current = captureScriptedArmBases(bones)
      }
    }
    restoreIdleRef.current = captureIdleBases

    const finishReplay = () => {
      replayRef.current = null
      scriptedRef.current = null
      captureIdleBases()
      onDoneRef.current?.()
    }

    const applyBody = (body: BodyPose, dt: number, soft = true) => {
      if (!rig) return
      if (soft) {
        smoothed = {
          left: leftFilter.filter(body.left, dt),
          right: rightFilter.filter(body.right, dt),
          head: headFilter.filter(body.head, dt),
        }
      } else {
        // Scripted poses are already smooth — light filter only
        smoothed = {
          left: leftFilter.filter(body.left, dt * 1.8),
          right: rightFilter.filter(body.right, dt * 1.8),
          head: headFilter.filter(body.head, dt * 1.8),
        }
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

      const scripted = scriptedRef.current
      const playingScript = signingRef.current && !!scripted && !!rig
      const replay = replayRef.current
      const replayingJson = signingRef.current && !!replay && !!rig && !signVideoDrivingRef.current && !playingScript
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
        !playingScript &&
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
          const capture = captureRef.current
          if (capture.active) {
            const frame = frameFromMediaPipe(pose, hands, handSides)
            if (frame) {
              if (!capture.t0) capture.t0 = nowMs
              capture.tLast = nowMs
              capture.frames.push(frame)
            }
          }
          const body = toBodyPose(pose, hands, handSides, true)
          const left = holdArm(body.left, smoothed.left, leftHold)
          const right = holdArm(body.right, smoothed.right, rightHold)
          const heldHead = holdHead(body.head, smoothed.head, headMiss)
          headMiss = heldHead.missed
          applyBody({ left, right, head: heldHead.head }, dt)
        } catch {
          // duplicate timestamp — ignore
        }
      }

      if (playingScript && scripted) {
        rootScene.rotation.y = 0
        rootScene.rotation.z = 0
        // Keep torso idle — only the arms animate.
        if (headBone) headBone.rotation.set(0, 0, 0)
        if (neckBone) neckBone.rotation.set(0, 0, 0)
        const rate = Math.max(0.1, playbackRateRef.current)
        scripted.t += dt * rate
        if (scripted.t >= SCRIPTED_HELLO_DURATION_S) {
          finishReplay()
        } else {
          applyScriptedHello(scripted.bones, scripted.bases, scripted.t)
        }
      } else if (drivingSignVideo && signVideo) {
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
          // Replay captured keypoints exactly — no jump-hold (that freezes real signing motion).
          const pose = bodyPoseFromFrame(replay.clip.frames[replay.index], true)
          smoothed = {
            left: leftFilter.filter(pose.left, dt * 2.2),
            right: rightFilter.filter(pose.right, dt * 2.2),
            head: headFilter.filter(pose.head, dt * 2.2),
          }
          if (smoothed.left || smoothed.right || smoothed.head) rig.apply(smoothed, dt)
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

        // Start rendering immediately so scripted signs don't wait on MediaPipe.
        setLoading(false)
        raf = requestAnimationFrame(tick)

        if (!loadTrackersRef.current) return

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

        trackersReadyRef.current = true
      } catch {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      trackersReadyRef.current = false
      cancelAnimationFrame(raf)
      obs.disconnect()
      trackers?.pose.close()
      trackers?.hands.close()
      renderer.dispose()
      renderer.domElement.remove()
      restoreIdleRef.current = null
    }
  }, [])

  // Preload sample so MediaPipe can grab frames as soon as signing starts.
  useEffect(() => {
    const el = signVideoRef.current
    if (!el || !signVideoUrl) return
    if (el.getAttribute('src') === signVideoUrl) return
    el.src = signVideoUrl
    el.muted = true
    el.playsInline = true
    el.preload = 'auto'
    el.load()
  }, [signVideoUrl])

  useEffect(() => {
    let cancelled = false
    const el = signVideoRef.current

    if (!signing) {
      replayRef.current = null
      scriptedRef.current = null
      signVideoDrivingRef.current = false
      if (el) {
        el.pause()
        el.currentTime = 0
      }
      if (!liveTracking) restoreIdleRef.current?.()
      return
    }

    const finish = () => {
      if (cancelled) return
      signVideoDrivingRef.current = false
      replayRef.current = null
      scriptedRef.current = null
      if (el) el.pause()
      restoreIdleRef.current?.()
      onDoneRef.current?.()
    }

    const startLandmarks = async (url: string) => {
      try {
        let clip = clipCache.current.get(url)
        if (!clip) {
          const res = await fetch(url)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          clip = (await res.json()) as SignLandmarkClip
          clipCache.current.set(url, clip)
        }
        if (cancelled) return
        signVideoDrivingRef.current = false
        replayRef.current = { clip, index: 0, accum: 0 }
      } catch {
        if (!cancelled) finish()
      }
    }

    // Same path as live selfie mirroring: video → MediaPipe → toBodyPose(mirror).
    const startSignVideo = async (url: string) => {
      if (!el) {
        if (landmarksUrl) await startLandmarks(landmarksUrl)
        else finish()
        return
      }
      for (let i = 0; i < 120 && !trackersReadyRef.current && !cancelled; i++) {
        await new Promise(r => setTimeout(r, 50))
      }
      if (cancelled) return
      if (!trackersReadyRef.current) {
        if (landmarksUrl) await startLandmarks(landmarksUrl)
        else finish()
        return
      }

      let finished = false
      const onEnded = () => {
        if (finished || cancelled) return
        finished = true
        finish()
      }

      el.src = url
      el.muted = true
      el.playsInline = true
      el.playbackRate = Math.max(0.1, playbackRate)
      el.addEventListener('ended', onEnded)

      try {
        if (el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          await new Promise<void>((resolve, reject) => {
            const ok = () => { el.removeEventListener('error', bad); resolve() }
            const bad = () => { el.removeEventListener('loadeddata', ok); reject(new Error('load')) }
            el.addEventListener('loadeddata', ok, { once: true })
            el.addEventListener('error', bad, { once: true })
            el.load()
          })
        }
        el.currentTime = 0
        signVideoDrivingRef.current = true
        await el.play()
      } catch {
        el.removeEventListener('ended', onEnded)
        signVideoDrivingRef.current = false
        if (landmarksUrl) await startLandmarks(landmarksUrl)
        else finish()
        return
      }

      return () => {
        el.removeEventListener('ended', onEnded)
      }
    }

    // Hardcoded fallback only when no sample video / landmarks.
    if (!signVideoUrl && !landmarksUrl && scriptedSign === 'hello') {
      const start = () => {
        restoreIdleRef.current?.()
        const bones = scriptedBonesRef.current
        const bases = scriptedBasesRef.current
        if (!bones || !bases) return false
        scriptedRef.current = { id: 'hello', t: 0, bones, bases }
        return true
      }
      if (start()) {
        return () => {
          cancelled = true
          scriptedRef.current = null
        }
      }
      const id = window.setInterval(() => {
        if (cancelled) {
          window.clearInterval(id)
          return
        }
        if (start()) window.clearInterval(id)
      }, 50)
      return () => {
        cancelled = true
        window.clearInterval(id)
        scriptedRef.current = null
      }
    }

    let nestedCleanup: (() => void) | void

    void (async () => {
      // Prefer precomputed keypoints (captured during live mirror) over re-running MP on video.
      if (landmarksUrl) {
        await startLandmarks(landmarksUrl)
        return
      }
      if (signVideoUrl) {
        nestedCleanup = await startSignVideo(signVideoUrl)
        return
      }
      const id = setTimeout(() => finish(), durationMs)
      nestedCleanup = () => clearTimeout(id)
    })()

    return () => {
      cancelled = true
      nestedCleanup?.()
      signVideoDrivingRef.current = false
      replayRef.current = null
      if (el) {
        el.pause()
      }
    }
  }, [signing, signVideoUrl, landmarksUrl, scriptedSign, durationMs, liveTracking, playbackRate])

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
})
