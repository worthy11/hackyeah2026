/**
 * ConversationAvatar — persistent Three.js avatar for the Rozmowy tab.
 * Loads once on mount and runs a lifelike idle animation throughout.
 * When `signing` becomes true it fires onSigningDone after durationMs.
 */

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const AVATAR_URL = '/avatar_2_blendshapes.glb'

type MorphEntry = { mesh: THREE.SkinnedMesh; index: number }
type MorphMap   = Map<string, MorphEntry[]>

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

function findBone(scene: THREE.Object3D, name: string): THREE.Bone | null {
  let found: THREE.Bone | null = null
  scene.traverse(obj => {
    if (!found && obj instanceof THREE.Bone && obj.name.toLowerCase().includes(name.toLowerCase())) {
      found = obj
    }
  })
  return found
}

// Smooth random-ish value from multiple overlapping sines
function breathe(t: number, freq: number, phase = 0) {
  return Math.sin(t * freq + phase)
}

type Props = {
  signing: boolean
  durationMs?: number
  onSigningDone?: () => void
  landmarksUrl?: string | null
}

export function ConversationAvatar({ signing, durationMs = 2500, onSigningDone, landmarksUrl: _lm }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onDoneRef    = useRef(onSigningDone)
  useEffect(() => { onDoneRef.current = onSigningDone }, [onSigningDone])

  // ── Scene — mounted once ──────────────────────────────────────────────────
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
    key.position.set(0.7, 2.2, 1.8); scene.add(key)

    const resize = () => {
      const w = container.clientWidth, h = container.clientHeight
      if (!w || !h) return
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false)
    }
    resize()
    const obs = new ResizeObserver(resize)
    obs.observe(container)

    let raf = 0
    let morphMap: MorphMap = new Map()
    let headBone:  THREE.Bone | null = null
    let neckBone:  THREE.Bone | null = null
    let rootScene: THREE.Object3D | null = null

    // Blink state machine
    let blinkTimer  = 2.5 + Math.random() * 2   // seconds until next blink
    let blinkPhase  = 0                          // 0=open, >0=closing/opening
    const BLINK_DUR = 0.12                       // total blink duration (s)

    let lastT = performance.now() / 1000

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const now = performance.now() / 1000
      const dt  = Math.min(0.05, now - lastT)
      lastT = now

      if (!rootScene) { renderer.render(scene, camera); return }

      // ── Body sway: slow drift left/right + very slight lean ───────────────
      rootScene.rotation.y =
        breathe(now, 0.31, 0.0) * 0.06 +
        breathe(now, 0.17, 1.1) * 0.02
      rootScene.rotation.z =
        breathe(now, 0.23, 0.5) * 0.012 +
        breathe(now, 0.11, 2.3) * 0.005

      // ── Head: independent nod + lateral look + slight tilt ────────────────
      if (headBone) {
        headBone.rotation.x =
          breathe(now, 0.19, 0.8) * 0.04 +   // gentle nod
          breathe(now, 0.43, 1.7) * 0.015
        headBone.rotation.y =
          breathe(now, 0.27, 0.3) * 0.08 +   // look left/right
          breathe(now, 0.13, 2.1) * 0.03
        headBone.rotation.z =
          breathe(now, 0.21, 1.2) * 0.03     // slight tilt
      }
      if (neckBone) {
        neckBone.rotation.y = breathe(now, 0.27, 0.3) * 0.03
        neckBone.rotation.x = breathe(now, 0.19, 0.8) * 0.015
      }

      // ── Eye look (subtle drift) ───────────────────────────────────────────
      const eyeR = Math.max(0, breathe(now, 0.33, 0.9) * 0.06)
      const eyeL = Math.max(0, breathe(now, 0.33, 0.9 + Math.PI) * 0.06)
      setMorph(morphMap, 'eyeLookOutLeft',  eyeL)
      setMorph(morphMap, 'eyeLookInLeft',   0)
      setMorph(morphMap, 'eyeLookOutRight', eyeR)
      setMorph(morphMap, 'eyeLookInRight',  0)
      const eyeDown = Math.max(0, breathe(now, 0.41, 1.4) * 0.05)
      setMorph(morphMap, 'eyeLookDownLeft',  eyeDown)
      setMorph(morphMap, 'eyeLookDownRight', eyeDown)

      // ── Blink state machine ───────────────────────────────────────────────
      blinkTimer -= dt
      if (blinkTimer <= 0 && blinkPhase === 0) {
        blinkPhase = BLINK_DUR          // start blink
        blinkTimer = 2.5 + Math.random() * 3
      }
      if (blinkPhase > 0) {
        blinkPhase -= dt
        // 0→1 close, 1→0 open, triangular
        const progress = blinkPhase / BLINK_DUR
        const blink = progress < 0.5
          ? (progress / 0.5)           // closing
          : ((1 - progress) / 0.5)    // opening
        setMorph(morphMap, 'eyeBlinkLeft',  blink)
        setMorph(morphMap, 'eyeBlinkRight', blink)
        if (blinkPhase <= 0) {
          blinkPhase = 0
          setMorph(morphMap, 'eyeBlinkLeft',  0)
          setMorph(morphMap, 'eyeBlinkRight', 0)
        }
      }

      // ── Slight smile ──────────────────────────────────────────────────────
      const smile = 0.12 + breathe(now, 0.09, 0.6) * 0.04
      setMorph(morphMap, 'mouthSmileLeft',  smile)
      setMorph(morphMap, 'mouthSmileRight', smile)

      renderer.render(scene, camera)
    }

    void new GLTFLoader().loadAsync(AVATAR_URL).then(gltf => {
      scene.add(gltf.scene)
      rootScene  = gltf.scene
      morphMap   = buildMorphMap(gltf.scene)
      headBone   = findBone(gltf.scene, 'Head')
      neckBone   = findBone(gltf.scene, 'Neck')
      raf = requestAnimationFrame(tick)
    })

    return () => {
      cancelAnimationFrame(raf)
      obs.disconnect()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  // ── Signing timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!signing) return
    const id = setTimeout(() => onDoneRef.current?.(), durationMs)
    return () => clearTimeout(id)
  }, [signing, durationMs])

  return <div className="avatar-replay__canvas" ref={containerRef} />
}
