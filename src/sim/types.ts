// Tipos compartidos por todos los simuladores.

export type NodeKind = 'router' | 'host'

export interface Iface {
  /** Nombre RouterOS/Linux: ether2, vlan-acceso, eth1... */
  name: string
  mac: string
  ip?: string
  prefix?: number
  /** Id del segmento (Red Interna de VirtualBox) al que está enchufada */
  segment: string
  /** Si la interfaz es una VLAN, su vlan-id */
  vlan?: number
}

export interface Device {
  id: string
  label: string
  kind: NodeKind
  x: number
  y: number
  ifaces: Iface[]
  /** Texto chico debajo del nombre (rol, AS, router-id...) */
  note?: string
  /** Se dibuja atenuado: está en la topología pero no participa */
  muted?: boolean
}

export interface Segment {
  id: string
  label: string
  sub?: string
  /** link = punto a punto entre dos nodos; bus = segmento compartido (backbone, LAN) */
  kind: 'link' | 'bus'
  /** Para bus: línea horizontal en y, desde x1 hasta x2 */
  y?: number
  x1?: number
  x2?: number
  dashed?: boolean
}

export interface Topology {
  width: number
  height: number
  devices: Device[]
  segments: Segment[]
}

export type RouteProto = 'connected' | 'static' | 'ospf' | 'bgp' | 'dhcp'

export interface Route {
  dst: string
  gateway?: string
  iface?: string
  proto: RouteProto
  distance: number
  metric?: number
  comment?: string
  /** false = la ruta existe pero no se usa (gateway inalcanzable o perdió por distance) */
  active?: boolean
  note?: string
}

export interface ArpEntry {
  ip: string
  mac: string
  iface: string
}

export interface HeaderField {
  k: string
  v: string
  hl?: boolean
}

export interface HeaderLayer {
  title: string
  fields: HeaderField[]
}

export type PacketKind =
  | 'arp-req'
  | 'arp-rep'
  | 'icmp-req'
  | 'icmp-rep'
  | 'ospf'
  | 'bgp'
  | 'tcp'
  | 'dhcp'
  | 'error'

export interface FrameInfo {
  srcMac: string
  dstMac: string
  srcIp: string
  dstIp: string
  /** EtherType como lo muestra el sniffer de WinBox: 2054 = ARP, 2048 = IPv4 */
  proto: string
  fromIface: string
  toIface: string
}

export interface PacketAnim {
  /** Id de trama: un broadcast genera varias animaciones con el mismo fid */
  fid: string
  from: string
  to: string
  segment: string
  label: string
  kind: PacketKind
  layers: HeaderLayer[]
  /** La trama sale pero nadie la recibe (nodo apagado, VLAN distinta...) */
  lost?: boolean
  frame?: FrameInfo
}

export interface TableData {
  id: string
  /** Agrupa tablas por dispositivo u objeto (R1, R2, Servidor DHCP...) */
  group: string
  title: string
  columns: string[]
  rows: string[][]
  empty?: string
}

export interface Step {
  title: string
  text: string
  cmd?: string
  packets: PacketAnim[]
  tables: TableData[]
  highlight?: string[]
  down?: string[]
  status?: 'ok' | 'fail' | 'info'
  /** Salida de consola para mostrar (traceroute, session print, etc.) */
  output?: string
  /** Topología propia del paso (por ejemplo, cuando DHCP le asigna IP al cliente) */
  topo?: Topology
}
