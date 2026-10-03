/**
 * AvatarReplay — drives the avatar through a pre-recorded landmark sequence.
 *
 * CURRENT STATE (POC stub):
 *   When `landmarksUrl` is null (videos not yet provided), shows the static
 *   avatar + a "signing…" indicator and resolves after `durationMs`.
 *
 * FUTURE WIRING (when landmark JSON files are available):
 *   Fetch `landmarksUrl` → `{ fps: number, frames: float[T][75][3] }`.
 *   Indices 0-32  = POSE_LANDMARKS  (same order as MediaPipe PoseLandmarker)
 *   Indices 33-53 = RIGHT_HAND_LANDMARKS
 *   Indices 54-74 = LEFT_HAND_LANDMARKS
 *   Each tick: convert the current frame to a BodyPose and call rig.apply().
 *   Replace the `// TODO: replay` block below with that logic.
 */

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
const AVATAR_URL = '/avatar_2_blendshapes.glb'

type Props = {
  /** Path to the landmark JSON produced by the backend, or null when pending. */
  landmarksUrl: string | null
  /** Human-readable label shown below the avatar (Polish gloss or phrase). */
  label: string
  /** Called when the avatar finishes signing. */
  onDone: () => void
  /** Fallback duration (ms) used when landmarksUrl is null. Default 2500. */
  durationMs?: number
}

export function AvatarReplay({ landmarksUrl, label: _label, onDone, durationMs = 2500 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Three.js scene (static avatar, no tracking) ───────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20)
    camera.position.set(0, 1.4, 1.85)
    camera.lookAt(0, 1.32, 0)
    scene.add(new THREE.HemisphereLight(0xffffff, 0xc5d0dc, 1.15))
    const key = new THREE.DirectionalLight(0xffffff, 1.7)
    key.position.set(0.7, 2.2, 1.8)
    scene.add(key)

    let raf = 0

    const resize = () => {
      const w = container.clientWidth, h = container.clientHeight
      if (!w || !h) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h, false)
    }
    resize()
    const obs = new ResizeObserver(resize)
    obs.observe(container)

    let avatarScene: THREE.Object3D | null = null
    let angle = 0

    const tick = () => {
      raf = requestAnimationFrame(tick)
      angle += 0.003

      // TODO: replay — when landmarksUrl is set, fetch frames and drive AvatarRig.apply() here
      // Format: { fps: number, frames: number[T][75][3] }
      //   [0:33]  = POSE_LANDMARKS
      //   [33:54] = RIGHT_HAND_LANDMARKS
      //   [54:75] = LEFT_HAND_LANDMARKS

      if (avatarScene) {
        // gentle idle sway while signing
        avatarScene.rotation.y = Math.sin(angle * 0.4) * 0.08
      }
      renderer.render(scene, camera)
    }

    void new GLTFLoader().loadAsync(AVATAR_URL).then(gltf => {
      scene.add(gltf.scene)
      avatarScene = gltf.scene
      raf = requestAnimationFrame(tick)
    })

    return () => {
      cancelAnimationFrame(raf)
      obs.disconnect()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  // ── Timing: resolve after durationMs (stub) or after landmark replay ───────
  useEffect(() => {
    // TODO: when landmarksUrl is set, derive duration from frame count / fps instead
    const id = setTimeout(onDone, durationMs)
    return () => clearTimeout(id)
  }, [landmarksUrl, durationMs, onDone])

  return (
    <div className="avatar-replay__canvas" ref={containerRef} />
  )
}
