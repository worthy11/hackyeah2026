import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const AVATAR_URL = '/avatar_2_blendshapes.glb'

export function StaticAvatar() {
  const containerRef = useRef<HTMLDivElement>(null)

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
      const w = container.clientWidth
      const h = container.clientHeight
      if (w === 0 || h === 0) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h, false)
      renderer.render(scene, camera)
    }
    resize()

    const observer = new ResizeObserver(resize)
    observer.observe(container)

    void new GLTFLoader().loadAsync(AVATAR_URL).then((gltf) => {
      scene.add(gltf.scene)
      renderer.render(scene, camera)

      // Gentle idle rotation so the pose is easier to read
      let angle = 0
      const tick = () => {
        raf = requestAnimationFrame(tick)
        angle += 0.003
        gltf.scene.rotation.y = Math.sin(angle * 0.4) * 0.18
        renderer.render(scene, camera)
      }
      tick()
    })

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div className="static-avatar-container" ref={containerRef} />
}
