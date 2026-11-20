import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react'
import { createWalk, walkDirection, type WalkDirection } from './campus-walk'

export const sectors = {
  production: { label: 'Produção', position: [-6, 7.5, -3] },
  showroom: { label: 'Showroom', position: [-11, 4.8, 9] },
  storage: { label: 'Depósito', position: [14, 6.8, -7] },
} as const
export type Sector = keyof typeof sectors
const sectorKeys = Object.keys(sectors) as Sector[]
const asset = import.meta.env.BASE_URL + 'campus/oficina.glb'
let revealed = false

function release(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  object.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return
    geometries.add(child.geometry)
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      materials.add(material)
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value)
      }
    }
  })
  geometries.forEach(geometry => geometry.dispose())
  materials.forEach(material => material.dispose())
  textures.forEach(texture => {
    texture.dispose()
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) texture.image.close()
  })
}

interface Props {
  selected: Sector | null
  reset: number
  zoom: number
  moving: boolean
  walking: boolean
  onLeaveWalk: () => void
  onRoom: (room: string) => void
  onSelect: (sector: Sector) => void
  onReady: () => void
  onFailure: (reason: 'unavailable' | 'slow') => void
}

export default function CampusScene(props: Props) {
  const host = useRef<HTMLDivElement>(null)
  const markers = useRef<Partial<Record<Sector, HTMLButtonElement>>>({})
  const current = useRef(props)
  const invalidate = useRef<(() => void) | null>(null)
  const held = useRef(new Set<WalkDirection>())
  useEffect(() => {
    current.current = props
    invalidate.current?.()
  }, [props])
  useEffect(() => {
    if (props.walking) host.current?.focus({ preventScroll: true })
    else held.current.clear()
  }, [props.walking])

  useEffect(() => {
    const container = host.current
    if (!container) return
    const canvas = document.createElement('canvas')
    const compact = matchMedia('(max-width: 720px)').matches
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: !compact, alpha: true, powerPreference: compact ? 'low-power' : 'high-performance' })
    } catch {
      current.current.onFailure('unavailable')
      return
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, compact ? 1 : 1.5))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2
    renderer.shadowMap.enabled = !compact
    renderer.shadowMap.autoUpdate = false
    renderer.shadowMap.type = THREE.PCFShadowMap
    container.prepend(canvas)

    const scene = new THREE.Scene()
    const walk = createWalk()
    scene.add(walk.avatar)
    const camera = new THREE.OrthographicCamera(-28, 28, 18, -18, .1, 195)
    const direction = new THREE.Vector3(43, 39.5, 56)
    const home = new THREE.Vector3(0, 1.5, 0)
    camera.position.copy(home).add(direction)
    camera.zoom = revealed || !current.current.moving ? 1 : .85
    const controls = new OrbitControls(camera, canvas)
    controls.target.copy(home)
    controls.enablePan = false
    controls.enableZoom = false
    controls.enableDamping = true
    controls.dampingFactor = .1
    controls.minAzimuthAngle = -.55
    controls.maxAzimuthAngle = 1.4
    controls.minPolarAngle = .68
    controls.maxPolarAngle = 1.24
    controls.rotateSpeed = .6
    controls.touches.ONE = THREE.TOUCH.ROTATE
    controls.update()
    canvas.style.touchAction = 'pan-y'

    const ambient = new THREE.HemisphereLight('#b1d1ff', '#65513a', 1.2)
    const moon = new THREE.DirectionalLight('#a6caff', 2.05)
    moon.position.set(9, 28, 18)
    moon.castShadow = !compact
    moon.shadow.mapSize.set(1024, 1024)
    Object.assign(moon.shadow.camera, { left: -32, right: 32, top: 29, bottom: -29, far: 80 })
    moon.shadow.camera.updateProjectionMatrix()
    moon.shadow.normalBias = .05
    const rim = new THREE.DirectionalLight('#588eff', 1.25)
    rim.position.set(-18, 15, -20)
    scene.add(ambient, moon, rim)
    const interior = [
      [-11, 2.8, 8, 115], [5, 3.5, 8, 130], [14, 4, -7, 190],
      [-12, 3.7, -2, 200], [-2, 3.7, -2, 200], [16, 2.5, 4, 75],
    ].map(([x, y, z, power]) => {
      const lamp = new THREE.PointLight('#ffbf71', power, 14, 2)
      lamp.position.set(x, y, z)
      scene.add(lamp)
      return { lamp, power }
    })

    const ring = new THREE.Mesh(new THREE.RingGeometry(2.8, 2.87, 48),
      new THREE.MeshBasicMaterial({ color: '#a0e62d', transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false, depthTest: false }))
    ring.rotation.x = -Math.PI / 2
    ring.visible = false
    scene.add(ring)
    const point = new THREE.Vector3()
    const desired = home.clone()
    const goal = home.clone().add(direction)
    const heads: { mesh: THREE.Object3D; x: number }[] = []
    let model: THREE.Object3D | undefined
    let disposed = false
    let visible = true
    let frame = 0
    let previous = 0
    let elapsed = 0
    let rendered = 0
    let sampleMs = 0
    let samples = 0
    let lowWindows = 0
    let recenter = false
    let sector: Sector | null | undefined
    let reset = -1
    let firstFrame = true
    let dirty = true
    let walking = false
    let previousRoom = ''

    function wake() {
      if (!disposed && model && visible && !document.hidden && !frame) frame = requestAnimationFrame(render)
    }
    invalidate.current = wake
    function resize() {
      const { clientWidth: width, clientHeight: height } = container!
      if (!width || !height) return
      const aspect = width / height
      walk.camera.aspect = aspect
      walk.camera.updateProjectionMatrix()
      const half = Math.max(19, 28 / aspect)
      Object.assign(camera, { left: -half * aspect, right: half * aspect, top: half, bottom: -half })
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
      dirty = true
      wake()
    }
    function render(now: number) {
      frame = 0
      if (disposed || !visible || document.hidden) return
      const frameTime = previous ? now - previous : 0
      const dt = Math.min(frameTime, 80)
      previous = now
      const { selected, reset: resetId, zoom, moving, walking: explore } = current.current
      if (explore !== walking) {
        walking = explore
        controls.enabled = !walking
        walk.reset()
        walk.avatar.visible = walking
        previousRoom = ''
        dirty = true
      }
      if (selected !== sector || resetId !== reset) {
        sector = selected
        reset = resetId
        desired.copy(home)
        if (sector) {
          const [x,,z] = sectors[sector].position
          desired.set(x, 2, z)
          ring.position.set(x, sectors[sector].position[1] - .65, z)
        }
        goal.copy(desired).add(direction)
        recenter = true
      }
      const ease = moving ? 1 - Math.exp(-Math.max(dt, 1) / 135) : 1
      if (recenter) {
        camera.position.lerp(goal, ease)
        controls.target.lerp(desired, ease)
        if (camera.position.distanceToSquared(goal) < .001 && controls.target.distanceToSquared(desired) < .001) recenter = false
        dirty = true
      }
      const goalZoom = zoom * (sector ? 1.42 : 1)
      if (Math.abs(camera.zoom - goalZoom) > .001) {
        camera.zoom = THREE.MathUtils.lerp(camera.zoom, goalZoom, ease)
        camera.updateProjectionMatrix()
        dirty = true
      }
      const orbitChanged = controls.update()
      if (orbitChanged) dirty = true
      ring.visible = !walking && Boolean(sector)
      if (walking) {
        walk.keys.clear()
        held.current.forEach(key => walk.keys.add(key))
        const room = walk.update(dt, moving)
        if (room !== previousRoom) {
          previousRoom = room
          current.current.onRoom(room)
        }
        dirty = true
      }
      if (moving) {
        elapsed += dt / 1000
        heads.forEach(({ mesh, x }, index) => { mesh.position.x = x + Math.sin(elapsed * .85 + index * 1.7) * 1.42 })
        interior.forEach(({ lamp, power }, index) => { lamp.intensity = power * (1 + Math.sin(elapsed * .7 + index) * .045) })
        ring.material.opacity = .73 + .18 * Math.sin(elapsed * 2.3)
        ring.scale.setScalar(1 + .055 * Math.sin(elapsed * 2.3))
      }
      if (moving || dirty) {
        renderer.render(scene, walking ? walk.camera : camera)
        dirty = false
        for (const key of sectorKeys) {
          const marker = markers.current[key]
          if (!marker) continue
          const [x, y, z] = sectors[key].position
          point.set(x, y, z).project(camera)
          const inside = !walking && Math.abs(point.x) < .9 && Math.abs(point.y) < .86
          marker.style.visibility = inside ? 'visible' : 'hidden'
          marker.style.left = `${(point.x + 1) * 50}%`
          marker.style.top = `${(1 - point.y) * 50}%`
        }
      }
      if (firstFrame) {
        firstFrame = false
        revealed = true
        current.current.onReady()
      }
      if (moving && frameTime && ++rendered > 25) {
        sampleMs += frameTime
        samples++
        if (sampleMs >= 2300) {
          lowWindows = samples * 1000 / sampleMs < 23 ? lowWindows + 1 : 0
          sampleMs = samples = 0
          if (lowWindows >= 3) { current.current.onFailure('slow'); return }
        }
      }
      if (moving || (walking && held.current.size) || recenter || orbitChanged || Math.abs(camera.zoom - goalZoom) > .001) wake()
      else previous = 0
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      previous = 0
      wake()
    })
    intersection.observe(container)
    document.addEventListener('visibilitychange', wake)
    function releaseKeys() { held.current.clear(); wake() }
    window.addEventListener('blur', releaseKeys)
    document.addEventListener('visibilitychange', releaseKeys)
    const lose = (event: Event) => { event.preventDefault(); current.current.onFailure('unavailable') }
    function handleWalkKey(event: KeyboardEvent) {
      if (!current.current.walking) return
      const target = event.target
      if (target instanceof HTMLElement && (target.closest('input,select,textarea,[contenteditable=true],[role=dialog]'))) return
      if (event.key === 'Escape' && event.type === 'keydown') {
        current.current.onLeaveWalk()
        return
      }
      const direction = walkDirection(event.key)
      if (!direction) return
      event.preventDefault()
      if (event.type === 'keydown') held.current.add(direction)
      else held.current.delete(direction)
      wake()
    }
    canvas.addEventListener('webglcontextlost', lose)
    window.addEventListener('keydown', handleWalkKey)
    window.addEventListener('keyup', handleWalkKey)
    controls.addEventListener('start', () => { recenter = false })
    controls.addEventListener('change', wake)
    resize()
    void new GLTFLoader().loadAsync(asset).then(({ scene: building }) => {
      if (disposed) { release(building); return }
      model = building
      building.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return
        if (object.name.startsWith('CNC_Head')) heads.push({ mesh: object, x: object.position.x })
        const glazing = object.material instanceof THREE.Material && object.material.transparent
        object.castShadow = !glazing
        object.receiveShadow = !glazing
      })
      scene.add(building)
      renderer.shadowMap.needsUpdate = true
      wake()
    }).catch(() => { if (!disposed) current.current.onFailure('unavailable') })
    return () => {
      disposed = true
      invalidate.current = null
      cancelAnimationFrame(frame)
      intersection.disconnect()
      observer.disconnect()
      document.removeEventListener('visibilitychange', wake)
      document.removeEventListener('visibilitychange', releaseKeys)
      window.removeEventListener('blur', releaseKeys)
      window.removeEventListener('keydown', handleWalkKey)
      window.removeEventListener('keyup', handleWalkKey)
      canvas.removeEventListener('webglcontextlost', lose)
      controls.dispose()
      release(scene)
      moon.shadow.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    }
  }, [])

  function setPressed(direction: WalkDirection, pressed: boolean) {
    if (pressed) held.current.add(direction)
    else held.current.delete(direction)
    invalidate.current?.()
  }

  return <div className="campus-renderer" ref={host} data-walking={props.walking} tabIndex={props.walking ? 0 : undefined}
    aria-label={props.walking ? 'Exploração em terceira pessoa. Use W, A, S, D ou as setas.' : undefined}
    onBlur={event => {
      if (event.currentTarget.contains(event.relatedTarget)) return
      held.current.clear()
      invalidate.current?.()
    }}>{sectorKeys.map(key =>
    <button key={key} ref={node => { if (node) markers.current[key] = node; else delete markers.current[key] }}
      type="button" className="campus-marker" aria-label={sectors[key].label} aria-pressed={props.selected === key}
      onClick={() => props.onSelect(key)}><span /></button>)}
    {props.walking && <div className="campus-dpad" aria-label="Mover personagem">
      {([
        ['up', 'Andar para frente', ArrowUp], ['left', 'Andar para a esquerda', ArrowLeft],
        ['down', 'Andar para trás', ArrowDown], ['right', 'Andar para a direita', ArrowRight],
      ] as const).map(([direction, label, Icon]) => <button key={direction} type="button" className="campus-control" aria-label={label}
        onPointerDown={event => {
          event.currentTarget.setPointerCapture(event.pointerId)
          setPressed(direction, true)
        }}
        onLostPointerCapture={() => setPressed(direction, false)}
        onKeyDown={event => {
          if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); setPressed(direction, true) }
        }}
        onKeyUp={event => {
          if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); setPressed(direction, false) }
        }}><Icon size={20} /></button>)}
    </div>}
  </div>
}
