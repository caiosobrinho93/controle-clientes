import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export default function ShowroomViewer({ asset, title }: { asset: string; title: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  useEffect(() => {
    const container = host.current
    if (!container) return
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }) }
    catch { setStatus('failed'); return }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.32
    container.prepend(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, .05, 40)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.minDistance = 2.7
    controls.maxDistance = 10
    renderer.domElement.style.touchAction = 'pan-y'
    scene.add(new THREE.HemisphereLight('#edf1ff', '#735847', 2.3))
    const key = new THREE.DirectionalLight('#ffdfb7', 3)
    key.position.set(-3, 4, 5)
    const rim = new THREE.DirectionalLight('#afccff', 2)
    rim.position.set(4, 3, -3)
    scene.add(key, rim)
    let model: THREE.Object3D | undefined
    let disposed = false

    function draw() {
      if (model && !disposed) renderer.render(scene, camera)
    }
    function disposeModel(object: THREE.Object3D) {
      object.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return
        child.geometry.dispose()
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.forEach(material => material.dispose())
      })
    }
    function resize() {
      const width = container!.clientWidth
      const height = container!.clientHeight
      if (!width || !height) return
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
      draw()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    controls.addEventListener('change', draw)
    const contextLost = (event: Event) => { event.preventDefault(); setStatus('failed') }
    renderer.domElement.addEventListener('webglcontextlost', contextLost)
    void new GLTFLoader().loadAsync(asset).then(({ scene: loaded }) => {
      if (disposed) { disposeModel(loaded); return }
      model = loaded
      scene.add(loaded)
      const center = new THREE.Box3().setFromObject(loaded).getCenter(new THREE.Vector3())
      controls.target.copy(center)
      camera.position.copy(center).add(new THREE.Vector3(1.65, 1.05, 3.3))
      controls.update()
      resize()
      setStatus('ready')
    }).catch(() => { if (!disposed) setStatus('failed') })
    return () => {
      disposed = true
      observer.disconnect()
      controls.dispose()
      if (model) disposeModel(model)
      renderer.domElement.removeEventListener('webglcontextlost', contextLost)
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [asset])

  return <div className="showroom-viewer" ref={host} data-status={status} tabIndex={0} aria-label={`Visualização 3D de ${title}`}>
    {status === 'loading' && <span role="status">Carregando modelo…</span>}
    {status === 'failed' && <span role="status">3D indisponível neste aparelho. A imagem continua disponível.</span>}
  </div>
}
