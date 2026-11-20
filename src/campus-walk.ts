import * as THREE from 'three'

const halls = [
  { name: 'Produção · Máquinas CNC', x: -6, z: -6, width: 23, depth: 13 },
  { name: 'Depósito', x: 14, z: -8, width: 13, depth: 10 },
  { name: 'Showroom', x: -11, z: 8, width: 15, depth: 8 },
  { name: 'Administrativo', x: 5, z: 8, width: 11, depth: 7 },
  { name: 'Expedição', x: 16, z: 4, width: 8, depth: 8 },
]
const walls = halls.flatMap(({ x, z, width, depth }) => {
  const left = x - width / 2
  const right = x + width / 2
  const back = z - depth / 2
  const front = z + depth / 2
  return [
    [left, left, back, front], [right, right, back, front], [left, right, back, back],
    [left, x - 1.22, front, front], [x + 1.22, right, front, front],
  ]
})
const furniture = [
  ...[-16, -7, 2, 8].map(x => [x - 1.3, x + 1.3, 7.3, 8.7]),
  ...[-13, -6, 1].map(x => [x - 2, x + 2, -4.97, -2.43]),
  ...[10, 13, 16, 19].flatMap(x => [-6, -9].map(z => [x - .72, x + .72, z - .62, z + .62])),
]
const movement = {
  w: 'up', arrowup: 'up', s: 'down', arrowdown: 'down',
  a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right',
} as const
export type WalkDirection = typeof movement[keyof typeof movement]

export function walkDirection(key: string): WalkDirection | undefined {
  return movement[key.toLowerCase() as keyof typeof movement]
}

function blocked(x: number, z: number, radius: number, camera = false) {
  const intersects = ([left, right, back, front]: number[]) =>
    x > left - radius && x < right + radius && z > back - radius && z < front + radius
  return walls.some(intersects) || (!camera && furniture.some(intersects))
}

export function createVisitor(color = '#abc946') {
  const avatar = new THREE.Group()
  avatar.name = 'Visitante'
  avatar.visible = false
  const suit = new THREE.MeshStandardMaterial({ color, roughness: .65 })
  const dark = new THREE.MeshStandardMaterial({ color: '#222e40', roughness: .75 })
  const helmet = new THREE.MeshStandardMaterial({ color: '#ffdd8e', roughness: .37 })
  const block = (width: number, height: number, depth: number, material: THREE.Material, x: number, y: number, z = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
    mesh.position.set(x, y, z)
    avatar.add(mesh)
    return mesh
  }
  block(.47, .53, .27, suit, 0, 1.1)
  block(.35, .43, .16, dark, 0, 1.09, .19)
  block(.47, .065, .28, helmet, 0, 1.06)
  block(.28, .28, .28, helmet, 0, 1.54)
  block(.24, .10, .035, dark, 0, 1.51, -.15)
  const limbs = [
    block(.16, .71, .20, dark, -.13, .38),
    block(.16, .71, .20, dark, .13, .38),
    block(.14, .46, .16, suit, -.31, 1.04),
    block(.14, .46, .16, suit, .31, 1.04),
  ]
  return { avatar, stride: (phase: number, amplitude: number) => {
    limbs.forEach((mesh, index) => {
      mesh.rotation.x = Math.sin(phase + index * Math.PI) * amplitude * (index < 2 ? 1 : -1)
    })
  } }
}

export function createWalk() {
  const { avatar, stride } = createVisitor()
  const keys = new Set<WalkDirection>()
  const target = new THREE.Vector3()
  const goal = new THREE.Vector3()
  const camera = new THREE.PerspectiveCamera(58, 1, .08, 120)
  let time = 0
  let fresh = true

  function reset() {
    avatar.position.set(5, .25, 14)
    avatar.rotation.y = 0
    time = 0
    fresh = true
    keys.clear()
  }
  function update(dt: number, animate: boolean) {
    const dx = Number(keys.has('right')) - Number(keys.has('left'))
    const dz = Number(keys.has('down')) - Number(keys.has('up'))
    const distance = Math.hypot(dx, dz)
    const position = avatar.position
    if (distance && dt) {
      const speed = dt * .0051 / distance
      const x = THREE.MathUtils.clamp(position.x + dx * speed, -20.7, 20.7)
      const z = THREE.MathUtils.clamp(position.z + dz * speed, -15.8, 16.1)
      if (!blocked(x, position.z, .27)) position.x = x
      if (!blocked(position.x, z, .27)) position.z = z
      avatar.rotation.y = Math.atan2(-dx, -dz)
      time += dt
    }
    const room = halls.find(({ x, z, width, depth }) =>
      Math.abs(position.x - x) < width / 2 && Math.abs(position.z - z) < depth / 2)
    stride(time / 86, animate && distance ? .55 : 0)
    position.y = room ? .3 : .09
    // Keep the following camera on the player's side of glass and walls.
    let follow = 4.6
    for (let offset = .24; offset < follow; offset += .15) {
      if (blocked(position.x, position.z + offset, .18, true)) { follow = Math.max(.27, offset - .17); break }
    }
    avatar.visible = follow > .72
    goal.set(position.x, position.y + (room ? 2.25 : 2.9), position.z + follow)
    if (fresh || !animate) camera.position.copy(goal)
    else {
      camera.position.lerp(goal, 1 - Math.exp(-Math.max(dt, 1) / 74))
      camera.position.z = Math.min(camera.position.z, goal.z)
    }
    target.set(position.x, position.y + 1.55, position.z - 2.1)
    camera.lookAt(target)
    fresh = false
    return room?.name ?? 'Pátio'
  }

  reset()
  return { avatar, camera, keys, reset, update }
}
