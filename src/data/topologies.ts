// Topologías de cada práctica, con las IP, redes e interfaces del material de la cátedra.
// Las MAC de P1 son las del ejemplo de la guía; el resto son ilustrativas (prefijo 08:00:27
// de VirtualBox): en tu laboratorio van a ser otras.
import type { Device, Route, Topology } from '../sim/types'

const mac = (a: string, b: string) => `08:00:27:${a}:00:${b}`

// ---------------- P1 · LAN base ----------------
export const P1_CLIENT_MAC = '08:00:27:A1:B2:C3'
export const P1_ROUTER_MAC = '08:00:27:D4:E5:F6'

export const p1Topology: Topology = {
  width: 1000,
  height: 330,
  segments: [{ id: 'lan1', label: 'lan1', sub: '192.168.1.0/24 · Red Interna', kind: 'link' }],
  devices: [
    {
      id: 'cliente',
      label: 'Cliente-Virtual',
      kind: 'host',
      x: 220,
      y: 165,
      note: 'CHR en rol de cliente',
      ifaces: [{ name: 'ether2', mac: P1_CLIENT_MAC, ip: '192.168.1.10', prefix: 24, segment: 'lan1' }],
    },
    {
      id: 'router',
      label: 'Router-Borde',
      kind: 'router',
      x: 780,
      y: 165,
      note: 'gateway de LAN1',
      ifaces: [{ name: 'ether2', mac: P1_ROUTER_MAC, ip: '192.168.1.1', prefix: 24, segment: 'lan1' }],
    },
  ],
}

// ---------------- P2 · Cadena ----------------
const p2Routers: Device[] = [
  {
    id: 'R1', label: 'R1', kind: 'router', x: 110, y: 120, note: 'extremo',
    ifaces: [
      { name: 'ether2', mac: mac('01', '02'), ip: '10.10.10.1', prefix: 24, segment: 'net-1-2' },
      { name: 'ether3', mac: mac('01', '03'), ip: '192.168.1.1', prefix: 24, segment: 'lan1' },
    ],
  },
  {
    id: 'R2', label: 'R2', kind: 'router', x: 370, y: 120, note: 'intermedio',
    ifaces: [
      { name: 'ether2', mac: mac('02', '02'), ip: '10.10.10.2', prefix: 24, segment: 'net-1-2' },
      { name: 'ether3', mac: mac('02', '03'), ip: '10.10.11.2', prefix: 24, segment: 'net-2-3' },
      { name: 'ether4', mac: mac('02', '04'), ip: '192.168.2.1', prefix: 24, segment: 'lan2' },
    ],
  },
  {
    id: 'R3', label: 'R3', kind: 'router', x: 630, y: 120, note: 'intermedio',
    ifaces: [
      { name: 'ether2', mac: mac('03', '02'), ip: '10.10.11.3', prefix: 24, segment: 'net-2-3' },
      { name: 'ether3', mac: mac('03', '03'), ip: '10.10.12.3', prefix: 24, segment: 'net-3-4' },
      { name: 'ether4', mac: mac('03', '04'), ip: '192.168.3.1', prefix: 24, segment: 'lan3' },
    ],
  },
  {
    id: 'R4', label: 'R4', kind: 'router', x: 890, y: 120, note: 'extremo',
    ifaces: [
      { name: 'ether2', mac: mac('04', '02'), ip: '10.10.12.4', prefix: 24, segment: 'net-3-4' },
      { name: 'ether3', mac: mac('04', '03'), ip: '192.168.4.1', prefix: 24, segment: 'lan4' },
    ],
  },
]

const clients = (xs: number[], y: number): Device[] =>
  xs.map((x, i) => ({
    id: `C${i + 1}`,
    label: `Cliente-${i + 1}`,
    kind: 'host' as const,
    x,
    y,
    ifaces: [{ name: 'ether2', mac: mac(`C${i + 1}`, '02'), ip: `192.168.${i + 1}.10`, prefix: 24, segment: `lan${i + 1}` }],
  }))

export const p2Topology: Topology = {
  width: 1040,
  height: 420,
  segments: [
    { id: 'net-1-2', label: 'net-1-2', sub: '10.10.10.0/24', kind: 'link' },
    { id: 'net-2-3', label: 'net-2-3', sub: '10.10.11.0/24', kind: 'link' },
    { id: 'net-3-4', label: 'net-3-4', sub: '10.10.12.0/24', kind: 'link' },
    { id: 'lan1', label: 'lan1', sub: '192.168.1.0/24', kind: 'link' },
    { id: 'lan2', label: 'lan2', sub: '192.168.2.0/24', kind: 'link' },
    { id: 'lan3', label: 'lan3', sub: '192.168.3.0/24', kind: 'link' },
    { id: 'lan4', label: 'lan4', sub: '192.168.4.0/24', kind: 'link' },
  ],
  devices: [...p2Routers, ...clients([110, 370, 630, 890], 350)],
}

/** Default gateway de cada Cliente Virtual (paso opcional de P2/P3). */
export const clientDefaults: Record<string, Route[]> = Object.fromEntries(
  [1, 2, 3, 4].map((n) => [
    `C${n}`,
    [{ dst: '0.0.0.0/0', gateway: `192.168.${n}.1`, proto: 'static' as const, distance: 1, comment: `default a R${n}` }],
  ]),
)

// ---------------- P3/P4/P5 · Backbone ----------------
function backboneRouters(): Device[] {
  return [1, 2, 3, 4].map((n) => ({
    id: `R${n}`,
    label: `R${n}`,
    kind: 'router' as const,
    x: 140 + (n - 1) * 240,
    y: 190,
    ifaces: [
      { name: 'ether2', mac: mac(`0${n}`, '02'), ip: `10.10.10.${n}`, prefix: 24, segment: 'backbone' },
      { name: 'ether3', mac: mac(`0${n}`, '03'), ip: `192.168.${n}.1`, prefix: 24, segment: `lan${n}` },
    ],
  }))
}

export const p3Topology: Topology = {
  width: 1040,
  height: 450,
  segments: [
    { id: 'backbone', label: 'backbone', sub: '10.10.10.0/24 · Red Interna «backbone»', kind: 'bus', y: 70, x1: 40, x2: 960 },
    ...[1, 2, 3, 4].map((n) => ({ id: `lan${n}`, label: `lan${n}`, sub: `192.168.${n}.0/24`, kind: 'link' as const })),
  ],
  devices: [...backboneRouters(), ...clients([140, 380, 620, 860], 390)],
}

/** Backbone sin clientes: cada LAN es un tramo propio debajo del router (P4, P5). */
export function backboneOnly(sub = '10.10.10.0/24'): Topology {
  return {
    width: 1000,
    height: 330,
    segments: [
      { id: 'backbone', label: 'backbone', sub, kind: 'bus', y: 70, x1: 40, x2: 960 },
      ...[1, 2, 3, 4].map((n) => ({
        id: `lan${n}`,
        label: `lan${n}`,
        sub: `192.168.${n}.0/24`,
        kind: 'bus' as const,
        y: 290,
        x1: 140 + (n - 1) * 240 - 80,
        x2: 140 + (n - 1) * 240 + 80,
      })),
    ],
    devices: backboneRouters(),
  }
}

// ---------------- P6 · DHCP e IPoE ----------------
export const P6_C1_MAC = mac('C1', '02')
export const P6_R2_MAC = mac('A2', '02')

export function p6Topology(c1Ip?: string, r2Ip?: string, r2Vlan = 100): Topology {
  return {
    width: 1000,
    height: 330,
    segments: [
      { id: 'acceso', label: 'acceso · vlan-acceso', sub: `VID 100 · 100.64.1.0/24 · IPoE`, kind: 'link' },
      { id: 'lan1', label: 'lan1', sub: '192.168.1.0/24 · DHCP .100–.200', kind: 'link' },
    ],
    devices: [
      {
        id: 'R2', label: 'R2', kind: 'router', x: 150, y: 165, note: 'abonado',
        ifaces: [{ name: `vlan-acceso (ether2, VID ${r2Vlan})`, mac: P6_R2_MAC, ip: r2Ip, prefix: r2Ip ? 24 : undefined, segment: 'acceso', vlan: r2Vlan }],
      },
      {
        id: 'R1', label: 'R1', kind: 'router', x: 500, y: 165, note: 'concentrador · reparte',
        ifaces: [
          { name: 'vlan-acceso (ether2)', mac: mac('01', '02'), ip: '100.64.1.1', prefix: 24, segment: 'acceso', vlan: 100 },
          { name: 'ether3', mac: mac('01', '03'), ip: '192.168.1.1', prefix: 24, segment: 'lan1' },
        ],
      },
      {
        id: 'C1', label: 'C1', kind: 'host', x: 850, y: 165, note: 'pide DHCP',
        ifaces: [{ name: 'ether2', mac: P6_C1_MAC, ip: c1Ip, prefix: c1Ip ? 24 : undefined, segment: 'lan1' }],
      },
    ],
  }
}
