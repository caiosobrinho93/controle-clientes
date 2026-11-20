import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Minus, Plus, RotateCcw, RotateCw, X } from 'lucide-react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { walkDirection, type WalkDirection } from './campus-walk'

export interface Exhibit {
  id: string
  title: string
  category: string
  description: string
  layout?: 'wide' | 'floor'
  assetUrl?: string
}

type Command = WalkDirection | 'turn-left' | 'turn-right'
// Floor area: 17 × 26 = 442 m². The previous room was 13 × 17 = 221 m².
const room = { halfWidth: 8.5, back: -16, front: 10, height: 4.1 }
const maxZoom = 3
const controls = [
  ['up', 'Andar para frente', ArrowUp],
  ['left', 'Andar à esquerda', ArrowLeft],
  ['down', 'Andar para trás', ArrowDown],
  ['right', 'Andar à direita', ArrowRight],
  ['turn-left', 'Olhar à esquerda', RotateCcw],
  ['turn-right', 'Olhar à direita', RotateCw],
] as const

function buildRoom(pieces: Exhibit[], assets: string, refresh: () => void, hasDoor: boolean) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#ded0b6')
  const loader = new THREE.TextureLoader()
  function surface(id: string, tint: string, roughness: number, relief: number) {
    const load = (channel: 'diff' | 'nor_gl') => {
      const texture = loader.load(assets + 'materials/' + id + '_' + channel + '_1k.jpg', refresh)
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      texture.anisotropy = 4
      return texture
    }
    const map = load('diff')
    map.colorSpace = THREE.SRGBColorSpace
    return new THREE.MeshStandardMaterial({
      color: tint, map, normalMap: load('nor_gl'), normalScale: new THREE.Vector2(relief, relief), roughness,
    })
  }
  const plaster = surface('beige_wall_001', '#e3dbcf', .87, .56)
  const oak = surface('wood_floor', '#c4a67f', .51, .63)
  const concrete = surface('concrete_floor_worn_001', '#b4aca0', .73, .54)
  const dark = new THREE.MeshStandardMaterial({ color: '#343a32', roughness: .69 })
  const metal = new THREE.MeshStandardMaterial({ color: '#515247', roughness: .36, metalness: .42 })
  const diffuser = new THREE.MeshBasicMaterial({ color: '#fff3d9', toneMapped: false })
  const olive = new THREE.MeshStandardMaterial({ color: '#597345', roughness: .87 })
  const box = (material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) => {
    const geometry = new THREE.BoxGeometry(w, h, d)
    if (material instanceof THREE.MeshStandardMaterial && material.map) {
      const position = geometry.attributes.position
      const normal = geometry.attributes.normal
      const uv = geometry.attributes.uv
      const tile = material === oak ? 1.7 : 3
      for (let i = 0; i < uv.count; i++) {
        const side = Math.abs(normal.getX(i)) > .5
        const top = Math.abs(normal.getY(i)) > .5
        uv.setXY(i, (side ? position.getZ(i) : position.getX(i)) / tile,
          (top ? -position.getZ(i) : position.getY(i)) / tile)
      }
    }
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    scene.add(mesh)
    return mesh
  }
  const width = room.halfWidth * 2
  const length = room.front - room.back
  const middle = (room.front + room.back) / 2
  box(oak, 0, -.10, middle, width, .2, length)
  box(plaster, 0, room.height + .13, middle, width, .26, length)
  box(plaster, 0, room.height / 2, room.back, width, room.height, .18)
  box(plaster, 0, room.height / 2, room.front, width, room.height, .18)
  if (hasDoor) {
    const x = room.halfWidth - .15
    const z = 7
    const door = box(oak, x, 1.31, z, .16, 2.62, 1.48)
    door.userData.privateDoor = true
    for (const offset of [-.79, .79]) box(dark, x - .09, 1.33, z + offset, .09, 2.66, .10)
    const handle = box(metal, x - .13, 1.05, z + .5, .13, .045, .16)
    handle.userData.privateDoor = true
    const sign = label('Minha sala', 'Acesso com código', 1.62, .46)
    sign.position.set(x - .11, 2.96, z)
    sign.rotation.y = -Math.PI / 2
    sign.userData.privateDoor = true
    scene.add(sign)
  }
  for (const side of [-1, 1]) {
    box(plaster, side * room.halfWidth, room.height / 2, middle, .20, room.height, length)
    box(dark, side * (room.halfWidth - .13), .09, middle, .08, .18, length - .22)
    box(dark, side * 2.78, room.height - .15, middle, .16, .16, length - .95)
    box(diffuser, side * 2.78, room.height - .235, middle, .063, .018, length - 1.2)
  }
  box(dark, 0, room.height / 2, room.back + .17, 8.6, room.height, .18)
  for (let i = -15; i <= 15; i++) box(oak, i * .27, room.height / 2, room.back + .32, .105, room.height, .16)
  const brand = label('oficina.', 'SHOWROOM DIGITAL', 3.8, 1.07)
  brand.position.set(0, 2.57, room.back + .43)
  scene.add(brand)
  scene.add(new THREE.HemisphereLight('#fff6e5', '#aaa8a0', 1.73))
  const keyLight = new THREE.DirectionalLight('#fff4e6', 1.38)
  keyLight.position.set(-3, 7, 5)
  scene.add(keyLight)
  const leaf = new THREE.SphereGeometry(.32, 7, 5)
  const planting = [{ x: -6.4, z: -13.8 }, { x: 6.4, z: -13.8 }]
  for (const { x, z } of planting) {
    box(concrete, x, .24, z, .76, .48, .76)
    box(oak, x, .76, z, .075, .58, .075)
    for (let i = 0; i < 11; i++) {
      const angle = i * 2.4
      const foliage = new THREE.Mesh(leaf, olive)
      foliage.scale.set(.79, 1.44, .48)
      foliage.rotation.z = Math.sin(angle) * .55
      foliage.position.set(x + Math.cos(angle) * .30, .91 + (i % 4) * .19, z + Math.sin(angle) * .31)
      scene.add(foliage)
    }
  }
  const stations = pieces.map((piece, index) => {
    const side = index % 2 === 0 ? -1 : 1
    const x = side * 4.5
    const z = 4.3 - Math.floor(index / 2) * 5.15
    const width = piece.layout === 'wide' ? 4.8 : piece.layout === 'floor' ? 1.68 : 3.3
    const depth = piece.layout ? 1.18 : 2.3
    const base = piece.assetUrl || piece.layout ? 0 : piece.category === 'Móveis' ? .21 : .73
    const angle = -side * (piece.layout === 'wide' ? .15 : piece.layout === 'floor' ? .38 : .68)
    if (base) {
      box(dark, x, .044, z, width - .16, .088, depth - .16)
      const platform = box(concrete, x, (base + .088) / 2, z, width, base - .088, depth)
      platform.userData.exhibit = index
    }
    if (piece.layout === 'wide') {
      const header = box(oak, x, 2.69, z - .015, 4.56, .14, .32)
      header.rotation.y = angle
      const dropHeight = room.height - 2.71
      for (const offset of [-1.82, 1.82]) {
        box(metal, x + Math.cos(angle) * offset, 2.71 + dropHeight / 2,
          z - .015 - Math.sin(angle) * offset, .046, dropHeight, .046)
      }
    }
    const panel = label(piece.title, piece.category, 2.35, .65)
    const labelY = piece.layout === 'wide' ? 3.05 : 2.56
    panel.position.set(x, labelY, z - 1.13)
    panel.userData.exhibit = index
    scene.add(panel)
    box(metal, x, (labelY + .31 + room.height) / 2, z - 1.17, .045, room.height - labelY - .31, .05)
    box(metal, x, 3.59, z, 1.35, .15, .29)
    box(metal, x, 3.85, z, .05, .38, .05)
    box(diffuser, x, 3.505, z, 1.22, .019, .19)
    const lamp = new THREE.SpotLight('#ffe5bc', 36, 8, .73, .76, 2)
    lamp.position.set(x, 3.46, z + .18)
    lamp.target.position.set(x, base, z)
    scene.add(lamp, lamp.target)
    return { x, z, width, depth, base, angle }
  })
  return { scene, stations, planting }
}

function label(title: string, subtitle: string, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 180
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#19201a'
  ctx.fillRect(0, 0, 640, 180)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#c6e48c'
  ctx.font = '600 28px sans-serif'
  ctx.fillText(subtitle.toUpperCase(), 320, 58)
  ctx.fillStyle = '#fff8e8'
  ctx.font = '700 51px sans-serif'
  ctx.fillText(title, 320, 129, 586)
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map }))
}

function dispose(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  object.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return
    geometries.add(child.geometry)
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material)
  })
  geometries.forEach(item => item.dispose())
  materials.forEach(item => {
    if ('map' in item && item.map instanceof THREE.Texture) textures.add(item.map)
    if ('normalMap' in item && item.normalMap instanceof THREE.Texture) textures.add(item.normalMap)
    item.dispose()
  })
  textures.forEach(item => item.dispose())
}

export default function ShowroomRoom({ pieces, assets, onFailure, onDoor }: {
  pieces: Exhibit[]; assets: string; onFailure: () => void; onDoor?: () => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const held = useRef(new Set<Command>())
  const wake = useRef<() => void>(() => {})
  const adjustZoom = useRef<(factor: number) => void>(() => {})
  const [zoom, setZoom] = useState(1)
  const [near, setNear] = useState<number | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const container = host.current
    if (!container) return
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: !matchMedia('(max-width: 650px)').matches }) }
    catch { onFailure(); return }
    const canvas = renderer.domElement
    canvas.setAttribute('aria-label', 'Sala 3D. Use WASD ou setas para caminhar e arraste para olhar.')
    container.append(canvas)
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.4))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    const { scene, stations, planting } = buildRoom(pieces, assets, schedule, Boolean(onDoor))
    const camera = new THREE.PerspectiveCamera(64, 1, .08, 60)
    camera.rotation.order = 'YXZ'
    camera.position.set(0, 1.65, room.front - 1.6)
    let yaw = 0
    let pitch = -.065
    let frame = 0
    let last = 0
    let gone = false
    let previousNear: number | null = null
    let drag: { id: number; x: number; y: number; distance: number } | null = null
    const touches = new Map<number, { x: number; y: number }>()
    let pinchDistance = 0
    const ray = new THREE.Raycaster()
    const pointer = new THREE.Vector2()

    function render(now: number) {
      frame = 0
      const dt = last ? Math.min((now - last) / 1000, .05) : 1 / 60
      last = now
      const keys = held.current
      yaw += (Number(keys.has('turn-left')) - Number(keys.has('turn-right'))) * dt * 1.62
      const advance = Number(keys.has('up')) - Number(keys.has('down'))
      const sideways = Number(keys.has('right')) - Number(keys.has('left'))
      const speed = 3.05 * dt / Math.max(1, Math.hypot(advance, sideways))
      const dx = (Math.cos(yaw) * sideways - Math.sin(yaw) * advance) * speed
      const dz = (-Math.sin(yaw) * sideways - Math.cos(yaw) * advance) * speed
      const { x, z } = camera.position
      const blocked = (x: number, z: number) => Math.abs(x) > room.halfWidth - .32 ||
        z < room.back + .52 || z > room.front - .32 ||
        stations.some(station => Math.abs(station.x - x) < station.width / 2 + .23 && Math.abs(station.z - z) < station.depth / 2 + .23) ||
        planting.some(plant => Math.abs(plant.x - x) < .62 && Math.abs(plant.z - z) < .62)
      if (!blocked(x + dx, z)) camera.position.x += dx
      if (!blocked(camera.position.x, z + dz)) camera.position.z += dz
      camera.rotation.set(pitch, yaw, 0, 'YXZ')
      let nearest: number | null = null
      let distance = 3.25
      stations.forEach((station, index) => {
        const candidate = Math.hypot(station.x - camera.position.x, station.z - camera.position.z)
        if (candidate < distance) { distance = candidate; nearest = index }
      })
      if (nearest !== previousNear) { previousNear = nearest; setNear(nearest) }
      renderer.render(scene, camera)
      if (keys.size) schedule()
      else last = 0
    }
    function schedule() {
      if (!gone && !frame && !document.hidden) frame = requestAnimationFrame(render)
    }
    wake.current = schedule
    function zoomBy(factor: number) {
      const next = THREE.MathUtils.clamp(camera.zoom * factor, 1, maxZoom)
      if (next === camera.zoom) return
      camera.zoom = next
      camera.updateProjectionMatrix()
      setZoom(next)
      schedule()
    }
    adjustZoom.current = zoomBy
    function wheel(event: WheelEvent) {
      if (event.ctrlKey || event.metaKey) return
      event.preventDefault()
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1
      zoomBy(Math.exp(-THREE.MathUtils.clamp(event.deltaY * units, -250, 250) * .002))
    }
    function resize() {
      if (!container!.clientHeight) return
      camera.aspect = container!.clientWidth / container!.clientHeight
      camera.fov = camera.aspect < 1 ? 85 : 64
      camera.updateProjectionMatrix()
      renderer.setSize(container!.clientWidth, container!.clientHeight)
      schedule()
    }
    function key(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key === 'Escape') { setSelected(null); return }
      if (event.target instanceof HTMLElement && event.target.closest('[data-showroom-details]')) return
      const command = walkDirection(event.key) ?? ({ q: 'turn-left', e: 'turn-right' } as const)[event.key.toLowerCase() as 'q' | 'e']
      if (!command) return
      event.preventDefault()
      if (event.type === 'keydown') held.current.add(command)
      else held.current.delete(command)
      schedule()
    }
    function stop() { held.current.clear(); last = 0; schedule() }
    function touchDistance() {
      const [a, b] = touches.values()
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
    }
    function startDrag(event: PointerEvent) {
      if (event.pointerType === 'touch') {
        canvas.setPointerCapture(event.pointerId)
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
        if (touches.size > 1) { pinchDistance = touchDistance(); drag = null; return }
      }
      if (drag || event.button !== 0) return
      canvas.setPointerCapture(event.pointerId)
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0 }
    }
    function moveDrag(event: PointerEvent) {
      if (touches.has(event.pointerId)) {
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
        if (touches.size > 1) {
          const distance = touchDistance()
          if (pinchDistance > 4 && distance > 4) zoomBy(distance / pinchDistance)
          pinchDistance = distance
          return
        }
      }
      if (!drag || drag.id !== event.pointerId) return
      const dx = event.clientX - drag.x
      const dy = event.clientY - drag.y
      drag.distance += Math.hypot(dx, dy)
      yaw -= dx * .005 / camera.zoom
      pitch = THREE.MathUtils.clamp(pitch - dy * .0046 / camera.zoom, -.88, .53)
      drag.x = event.clientX
      drag.y = event.clientY
      schedule()
    }
    function endDrag(event: PointerEvent) {
      if (touches.delete(event.pointerId) && !drag) {
        pinchDistance = touchDistance()
        if (touches.size === 1) {
          const [id, point] = touches.entries().next().value!
          drag = { id, ...point, distance: Infinity }
        }
        return
      }
      if (!drag || drag.id !== event.pointerId) return
      const clicked = event.type === 'pointerup' && drag.distance < 6
      drag = null
      if (!clicked) return
      const bounds = canvas.getBoundingClientRect()
      pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2)
      ray.setFromCamera(pointer, camera)
      const hit = ray.intersectObjects(scene.children, true)[0]?.object
      if (hit?.userData.privateDoor) { stop(); onDoor?.(); return }
      if (typeof hit?.userData.exhibit === 'number') { stop(); setSelected(hit.userData.exhibit) }
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    canvas.addEventListener('pointerdown', startDrag)
    canvas.addEventListener('pointermove', moveDrag)
    canvas.addEventListener('pointerup', endDrag)
    canvas.addEventListener('pointercancel', endDrag)
    canvas.addEventListener('lostpointercapture', endDrag)
    canvas.addEventListener('wheel', wheel, { passive: false })
    canvas.addEventListener('webglcontextlost', onFailure)
    window.addEventListener('keydown', key)
    window.addEventListener('keyup', key)
    window.addEventListener('blur', stop)
    document.addEventListener('visibilitychange', stop)
    resize()

    void Promise.allSettled(pieces.map(async (piece, index) => {
      const asset = piece.assetUrl ?? assets + piece.id + '.glb'
      const manager = new THREE.LoadingManager()
      if (piece.assetUrl) manager.setURLModifier(url => {
        if (url === asset || url.startsWith('blob:') || /^data:(image\/|application\/octet-stream)/i.test(url)) return url
        throw new Error('O GLB precisa conter todos os recursos no próprio arquivo.')
      })
      const { scene: model } = await new GLTFLoader(manager).loadAsync(asset)
      if (gone) { dispose(model); return }
      const station = stations[index]
      const bounds = new THREE.Box3().setFromObject(model)
      const center = bounds.getCenter(new THREE.Vector3())
      model.position.set(-center.x, -bounds.min.y, -center.z)
      if (piece.assetUrl) {
        const size = bounds.getSize(new THREE.Vector3())
        const c = Math.abs(Math.cos(station.angle))
        const s = Math.abs(Math.sin(station.angle))
        const fit = Math.min(1, station.width / (c * size.x + s * size.z),
          station.depth / (s * size.x + c * size.z), 2.5 / size.y)
        if (!Number.isFinite(fit) || fit <= 0) { dispose(model); throw new Error('Modelo sem dimensões válidas.') }
        model.scale.multiplyScalar(fit)
        model.position.multiplyScalar(fit)
      }
      model.traverse(child => { child.userData.exhibit = index })
      const mount = new THREE.Group()
      mount.position.set(station.x, station.base, station.z)
      mount.rotation.y = station.angle
      mount.add(model)
      scene.add(mount)
      schedule()
    })).then(results => {
      if (gone) return
      if (results.some(result => result.status === 'rejected')) { onFailure(); return }
      setLoading(false)
    })

    return () => {
      gone = true
      adjustZoom.current = () => {}
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('keydown', key)
      window.removeEventListener('keyup', key)
      window.removeEventListener('blur', stop)
      document.removeEventListener('visibilitychange', stop)
      canvas.removeEventListener('webglcontextlost', onFailure)
      canvas.removeEventListener('wheel', wheel)
      dispose(scene)
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    }
  }, [assets, onDoor, onFailure, pieces])

  function press(command: Command, down: boolean) {
    if (down) held.current.add(command)
    else held.current.delete(command)
    wake.current()
  }

  return <>
    <div ref={host} className="showroom-room-canvas" />
    <div className="showroom-scene-zoom" aria-label="Zoom da câmera">
      <button type="button" disabled={zoom <= 1} aria-label="Afastar visão" onClick={() => adjustZoom.current(1 / 1.25)}><Minus size={18} /></button>
      <output aria-label="Nível de zoom">{Math.round(zoom * 100)}%</output>
      <button type="button" disabled={zoom >= maxZoom} aria-label="Aproximar visão" onClick={() => adjustZoom.current(1.25)}><Plus size={18} /></button>
    </div>
    {loading && <div className="showroom-room-status" role="status">Carregando as peças…</div>}
    {near !== null && selected === null && <button type="button" className="showroom-room-inspect" onClick={() => setSelected(near)}>
      Ver {pieces[near].title}
    </button>}
    {selected !== null && <aside className="showroom-room-details" data-showroom-details aria-label="Detalhes da peça">
      <button type="button" aria-label="Fechar detalhes" onClick={() => setSelected(null)}><X size={19} /></button>
      {!pieces[selected].assetUrl && <img src={assets + pieces[selected].id + '.webp'} alt="" width="640" height="440" />}
      <small>{pieces[selected].category} · {pieces[selected].layout || pieces[selected].assetUrl ? 'Projeto do SketchUp' : 'Demonstração'}</small>
      <h2>{pieces[selected].title}</h2><p>{pieces[selected].description}</p>
    </aside>}
    <div className="showroom-room-controls" aria-label="Controles de movimento">
      {controls.map(([command, label, Icon]) => <button type="button" key={command} aria-label={label} title={label} data-command={command}
        onPointerDown={event => {
          event.currentTarget.setPointerCapture(event.pointerId)
          press(command, true)
        }}
        onLostPointerCapture={() => press(command, false)}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); press(command, true) }
        }}
        onKeyUp={event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); press(command, false) }
        }}
        onBlur={() => press(command, false)}><Icon size={20} /></button>)}
    </div>
  </>
}
