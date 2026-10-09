// Simulación de la sesión eBGP de P5 entre R1 (AS 65001) y R3 (AS 65003) sobre el backbone.
import type { HeaderLayer, PacketAnim, Route, Step, TableData, Topology } from './types'
import { buildTable, routeFlags } from './routing'
import { type SimState, dev, simulatePing } from './net'

export type BgpState = 'idle' | 'connect' | 'active' | 'opensent' | 'openconfirm' | 'established'

export interface BgpPeerCfg {
  id: string
  as: number
  rid: string
  ip: string
  mac: string
  lan: string
}

export interface BgpSession {
  name: string
  remote: string
  remoteAs: number
  state: BgpState
  prefixes: number
}

export interface BgpOptions {
  /** Las VMs vienen de P4 con OSPF andando */
  withOspf?: boolean
  /** Error: R1 declara remote.as=65002 en vez de 65003 */
  wrongAs?: boolean
  /** Pregunta 4: R2 (AS 65002) abre sesión sólo con R3 */
  r2WithR3?: boolean
}

/** Decide si una sesión puede subir: las dos puntas configuradas y los AS cruzados. */
export function sessionCanEstablish(a: { as: number; remoteAs?: number }, b: { as: number; remoteAs?: number }): boolean {
  return a.remoteAs !== undefined && b.remoteAs !== undefined && a.remoteAs === b.as && b.remoteAs === a.as
}

/** AS_PATH que ve un router cuando una ruta atraviesa una lista de AS (el más reciente primero). */
export function asPath(...ases: number[]): string {
  return ases.join(' ')
}

const PEERS: Record<string, BgpPeerCfg> = {
  R1: { id: 'R1', as: 65001, rid: '10.10.10.1', ip: '10.10.10.1', mac: '08:00:27:01:00:02', lan: '192.168.1.0/24' },
  R2: { id: 'R2', as: 65002, rid: '10.10.10.2', ip: '10.10.10.2', mac: '08:00:27:02:00:02', lan: '192.168.2.0/24' },
  R3: { id: 'R3', as: 65003, rid: '10.10.10.3', ip: '10.10.10.3', mac: '08:00:27:03:00:02', lan: '192.168.3.0/24' },
}

export class BgpSim {
  topo: Topology
  opts: BgpOptions
  steps: Step[] = []
  sessions: Record<string, BgpSession[]> = { R1: [], R2: [], R3: [], R4: [] }
  bgpRoutes: Record<string, Route[]> = { R1: [], R2: [], R3: [], R4: [] }
  sim: SimState
  private fid = 0

  constructor(topo: Topology, opts: BgpOptions = {}) {
    this.topo = topo
    this.opts = opts
    this.sim = { arp: {}, routes: {}, down: [] }
    for (const d of topo.devices) this.sim.arp[d.id] = []
    this.rebuild()
  }

  ospfFor(id: string): Route[] {
    if (!this.opts.withOspf) return []
    const n = Number(id.slice(1))
    return [1, 2, 3, 4].filter((m) => m !== n).map((m) => ({ dst: `192.168.${m}.0/24`, gateway: `10.10.10.${m}`, proto: 'ospf' as const, distance: 110, metric: 2 }))
  }

  rebuild() {
    for (const d of this.topo.devices) this.sim.routes[d.id] = buildTable(d, [...this.bgpRoutes[d.id], ...this.ospfFor(d.id)])
  }

  tables = (_t: Topology, sim: SimState): TableData[] => {
    const out: TableData[] = []
    for (const id of ['R1', 'R3', ...(this.opts.r2WithR3 ? ['R2'] : [])]) {
      out.push({
        id: `ses-${id}`,
        group: id,
        title: `${id} · /routing bgp session print`,
        columns: ['NAME', 'REMOTE.ADDRESS', 'REMOTE.AS', 'STATE', 'PREFIX-COUNT'],
        rows: this.sessions[id].map((s) => [s.name, s.remote, String(s.remoteAs), s.state, String(s.prefixes)]),
        empty: 'sin sesiones',
      })
      out.push({
        id: `rt-${id}`,
        group: id,
        title: `${id} · /ip route print`,
        columns: ['FLAGS', 'DST-ADDRESS', 'GATEWAY', 'DIST', 'AS_PATH / NOTA'],
        rows: sim.routes[id].map((r) => [routeFlags(r), r.dst, r.gateway ?? r.iface ?? '', String(r.distance), [r.comment, r.note].filter(Boolean).join(' · ')]),
      })
    }
    return out
  }

  push(s: Omit<Step, 'tables'>) {
    this.steps.push({ ...s, tables: this.tables(this.topo, this.sim) })
  }

  tcpPkt(from: string, to: string, label: string, flags: string, extra?: HeaderLayer): PacketAnim {
    const a = PEERS[from]
    const b = PEERS[to]
    // R1 (y R2 en la variante) inician la conexión: su puerto destino es 179. R3 contesta desde 179.
    const toBgp = from !== 'R3'
    return {
      fid: `b${++this.fid}`,
      from,
      to,
      segment: 'backbone',
      label,
      kind: extra ? 'bgp' : 'tcp',
      layers: [
        { title: 'Ethernet II', fields: [{ k: 'MAC origen', v: a.mac }, { k: 'MAC destino', v: b.mac }, { k: 'EtherType', v: '0x0800 · IPv4' }] },
        { title: 'IPv4', fields: [{ k: 'IP origen', v: a.ip }, { k: 'IP destino', v: b.ip }, { k: 'TTL', v: '1 (eBGP: vecino directo)' }, { k: 'Protocolo', v: '6 · TCP' }] },
        { title: 'TCP', fields: [{ k: 'Puerto origen', v: toBgp ? '49152 (efímero)' : '179' }, { k: 'Puerto destino', v: toBgp ? '179 (BGP)' : '49152' }, { k: 'Flags', v: flags, hl: true }] },
        ...(extra ? [extra] : []),
      ],
    }
  }

  open(from: string, myAs: number): HeaderLayer {
    const p = PEERS[from]
    return { title: 'BGP OPEN', fields: [{ k: 'Versión', v: '4' }, { k: 'My AS', v: String(myAs), hl: true }, { k: 'Hold time', v: '180 s' }, { k: 'BGP Identifier', v: p.rid }] }
  }

  update(from: string, nlri: string[], path: string): HeaderLayer {
    const p = PEERS[from]
    return {
      title: 'BGP UPDATE',
      fields: [
        { k: 'Withdrawn', v: '(ninguna)' },
        { k: 'ORIGIN', v: '? incomplete (redistribuida)' },
        { k: 'AS_PATH', v: path, hl: true },
        { k: 'NEXT_HOP', v: p.ip, hl: true },
        { k: 'NLRI (destinos)', v: nlri.join(', '), hl: true },
      ],
    }
  }

  learnFrom(to: string, from: string, nlri: string[], path: string) {
    const gw = PEERS[from].ip
    for (const dst of nlri) {
      this.bgpRoutes[to].push({ dst, gateway: gw, proto: 'bgp', distance: 20, comment: `AS_PATH ${path}` })
    }
    this.rebuild()
  }

  run() {
    const { withOspf, wrongAs, r2WithR3 } = this.opts
    const r1RemoteAs = wrongAs ? 65002 : 65003
    this.push({
      title: 'Punto de partida',
      text: `Cableado de P3: los cuatro en el backbone. R1 será el AS 65001 y R3 el AS 65003. R2 y R4 siguen conectados pero no participan${r2WithR3 ? ' (salvo la variante de la pregunta 4, donde R2 = AS 65002)' : ''}. ${withOspf ? 'Las VMs vienen de P4: OSPF sigue andando y ya hay rutas o (distance 110) a todas las LAN.' : 'Sin OSPF: cada router sólo conoce sus redes conectadas.'}`,
      packets: [],
      status: 'info',
    })
    this.push({
      title: 'Paso 1 · instancia BGP en R1 y en R3',
      text: 'El número de AS y el router-id viven en la instancia, no en cada conexión. ASN privados (64512–65534): convención del curso 6500<n>. Todavía no viaja nada: no hay ningún vecino declarado.',
      cmd: '# R1\n/routing bgp instance add name=i1 as=65001 router-id=10.10.10.1\n# R3\n/routing bgp instance add name=i1 as=65003 router-id=10.10.10.3',
      packets: [],
    })
    this.sessions.R1 = [{ name: 'peer-R3', remote: '10.10.10.3', remoteAs: r1RemoteAs, state: 'connect', prefixes: 0 }]
    this.push({
      title: 'Paso 2 · conexión sólo en R1 → intenta TCP 179',
      text: `En BGP no hay descubrimiento: el vecino se escribe a mano, con su IP y el AS que esperás. R1 intenta abrir una conexión TCP al puerto 179 de 10.10.10.3. output.redistribute=connected es lo que se va a anunciar (la LAN… y también el backbone, que también es conectado).${wrongAs ? ' Ojo: en esta variante R1 escribió remote.as=65002 por error.' : ''}`,
      cmd: `/routing bgp connection add name=peer-R3 \\\n    remote.address=10.10.10.3 remote.as=${r1RemoteAs} \\\n    instance=i1 local.role=ebgp \\\n    connect=yes listen=yes output.redistribute=connected \\\n    comment="eBGP con R3"`,
      packets: [this.tcpPkt('R1', 'R3', 'TCP SYN :179', 'SYN')],
      highlight: ['R1'],
    })
    this.sessions.R1[0].state = 'active'
    this.push({
      title: 'R3 contesta RST: nadie escucha por R1',
      text: 'R3 todavía no tiene una conexión para 10.10.10.1, así que rechaza el TCP (RST). La sesión en R1 queda en connect/active, reintentando. En OSPF alcanzaba con que uno solo "gritara" por el cable; en BGP hacen falta las dos puntas.',
      cmd: '/routing bgp session print',
      packets: [this.tcpPkt('R3', 'R1', 'TCP RST', 'RST, ACK')],
      output: '/routing bgp session print\n# en R1: la sesión no aparece established (no subió).\n# Anotá lo que ves: va al informe.',
      status: 'fail',
    })
    this.sessions.R3 = [{ name: 'peer-R1', remote: '10.10.10.1', remoteAs: 65001, state: 'connect', prefixes: 0 }]
    this.push({
      title: 'Paso 3 · la conexión en R3 (espejo)',
      text: 'Lo mismo en espejo: R3 declara a R1 con su AS. Los números tienen que cruzarse: el remote.as de cada punta es el as de la instancia de la otra.',
      cmd: '/routing bgp connection add name=peer-R1 \\\n    remote.address=10.10.10.1 remote.as=65001 \\\n    instance=i1 local.role=ebgp \\\n    connect=yes listen=yes output.redistribute=connected \\\n    comment="eBGP con R1"',
      packets: [],
    })
    this.sim.arp.R1.push({ ip: '10.10.10.3', mac: PEERS.R3.mac, iface: 'ether2' })
    this.sim.arp.R3.push({ ip: '10.10.10.1', mac: PEERS.R1.mac, iface: 'ether2' })
    this.push({
      title: 'TCP: SYN → SYN-ACK → ACK',
      text: 'R1 reintenta y ahora R3 acepta. Se completa el saludo de tres vías de TCP: BGP viaja sobre TCP 179, a diferencia de OSPF, que va directo sobre IP (protocolo 89).',
      packets: [this.tcpPkt('R1', 'R3', 'SYN', 'SYN'), this.tcpPkt('R3', 'R1', 'SYN-ACK', 'SYN, ACK'), this.tcpPkt('R1', 'R3', 'ACK', 'ACK')],
    })
    this.sessions.R1[0].state = 'opensent'
    this.sessions.R3[0].state = 'opensent'
    this.push({
      title: 'OPEN en los dos sentidos',
      text: 'Cada uno se presenta: versión 4, su AS, hold time (180 s) y router-id. Cada punta compara el AS que recibe con el remote.as que configuró.',
      packets: [this.tcpPkt('R1', 'R3', 'OPEN AS 65001', 'PSH, ACK', this.open('R1', 65001)), this.tcpPkt('R3', 'R1', 'OPEN AS 65003', 'PSH, ACK', this.open('R3', 65003))],
    })
    const can = sessionCanEstablish({ as: 65001, remoteAs: r1RemoteAs }, { as: 65003, remoteAs: 65001 })
    if (!can) {
      this.sessions.R1[0].state = 'idle'
      this.sessions.R3[0].state = 'active'
      this.push({
        title: 'NOTIFICATION: Bad Peer AS',
        text: 'R1 esperaba AS 65002 y R3 se presentó como 65003. R1 manda NOTIFICATION (OPEN Message Error / Bad Peer AS) y cierra. La sesión queda en idle/active y no se intercambia ninguna ruta. Tabla de diagnóstico: "que estén las dos puntas y que remote.as cruce".',
        packets: [this.tcpPkt('R1', 'R3', 'NOTIFICATION', 'PSH, ACK', { title: 'BGP NOTIFICATION', fields: [{ k: 'Error', v: '2 · OPEN Message Error', hl: true }, { k: 'Subcódigo', v: '2 · Bad Peer AS', hl: true }] })],
        status: 'fail',
        cmd: '/routing bgp session print',
      })
      return this
    }
    this.sessions.R1[0].state = 'established'
    this.sessions.R3[0].state = 'established'
    this.push({
      title: 'KEEPALIVE → established',
      text: 'Los AS cruzan, así que cada uno confirma con KEEPALIVE. La sesión pasa a established: el único estado que sirve. Desde ahora se mandan KEEPALIVE periódicos (cada 60 s; si pasan 180 s sin nada, se cae la sesión).',
      cmd: '/routing bgp session print',
      packets: [this.tcpPkt('R1', 'R3', 'KEEPALIVE', 'PSH, ACK', { title: 'BGP KEEPALIVE', fields: [{ k: 'Tipo', v: '4 · KEEPALIVE' }] }), this.tcpPkt('R3', 'R1', 'KEEPALIVE', 'PSH, ACK', { title: 'BGP KEEPALIVE', fields: [{ k: 'Tipo', v: '4 · KEEPALIVE' }] })],
      output: ' 0 E name="peer-R3-1" instance=i1\n     remote.address=10.10.10.3 .as=65003 .id=10.10.10.3\n     local.role=ebgp ... established',
      status: 'ok',
    })
    const nlri1 = ['192.168.1.0/24', '10.10.10.0/24']
    this.learnFrom('R3', 'R1', nlri1, '65001')
    this.sessions.R3[0].prefixes = nlri1.length
    this.push({
      title: 'UPDATE de R1 → R3: "a 192.168.1.0/24 llegás por mí"',
      text: `Lo único que viaja es el destino y el camino de AS, no el mapa. R3 instala 192.168.1.0/24 con protocolo BGP (flag b), distance 20, gateway 10.10.10.1. También llega 10.10.10.0/24 (es conectada en R1), pero en R3 gana la conectada (distance 0) y la de BGP queda inactiva.${withOspf ? ' Y la ruta OSPF a 192.168.1.0/24 (110) queda de respaldo: gana eBGP (20).' : ''}`,
      packets: [this.tcpPkt('R1', 'R3', 'UPDATE 192.168.1.0/24', 'PSH, ACK', this.update('R1', nlri1, '65001'))],
      highlight: ['R3'],
    })
    const nlri3 = ['192.168.3.0/24', '10.10.10.0/24']
    this.learnFrom('R1', 'R3', nlri3, '65003')
    this.sessions.R1[0].prefixes = nlri3.length
    this.push({
      title: 'UPDATE de R3 → R1',
      text: 'En espejo: R1 aprende 192.168.3.0/24 vía 10.10.10.3 con AS_PATH 65003. Esta es la prueba de verdad de la práctica: /ip route print where bgp.',
      cmd: '/ip route print where bgp',
      packets: [this.tcpPkt('R3', 'R1', 'UPDATE 192.168.3.0/24', 'PSH, ACK', this.update('R3', nlri3, '65003'))],
      highlight: ['R1'],
      status: 'ok',
    })
    if (r2WithR3) {
      this.sessions.R2 = [{ name: 'peer-R3', remote: '10.10.10.3', remoteAs: 65003, state: 'established', prefixes: 2 }]
      this.sessions.R3.push({ name: 'peer-R2', remote: '10.10.10.2', remoteAs: 65002, state: 'established', prefixes: 2 })
      this.learnFrom('R3', 'R2', ['192.168.2.0/24'], '65002')
      this.push({
        title: 'Pregunta 4 · R2 (AS 65002) abre sesión sólo con R3',
        text: 'Hipótesis de la pregunta de cierre: R2 con instancia as=65002 y una conexión sólo hacia R3. R3 aprende 192.168.2.0/24 con AS_PATH 65002.',
        packets: [this.tcpPkt('R2' as string, 'R3', 'UPDATE 192.168.2.0/24', 'PSH, ACK', this.update('R2', ['192.168.2.0/24'], '65002'))],
      })
      this.learnFrom('R1', 'R3', ['192.168.2.0/24'], asPath(65003, 65002))
      this.sessions.R1[0].prefixes += 1
      this.push({
        title: 'R3 le pasa la ruta a R1 con su AS adelante',
        text: 'eBGP reenvía a sus otros vecinos lo que aprendió, anteponiendo su propio AS. R1 aprende 192.168.2.0/24 con AS_PATH "65003 65002" (primero el AS más cercano). El simulador muestra NEXT_HOP 10.10.10.3; en un segmento compartido RouterOS podría conservar 10.10.10.2 como next-hop (third-party next-hop).',
        packets: [this.tcpPkt('R3', 'R1', 'UPDATE 192.168.2.0/24', 'PSH, ACK', this.update('R3', ['192.168.2.0/24'], '65003 65002'))],
        highlight: ['R1'],
        status: 'ok',
      })
    }
    const res = simulatePing(this.topo, this.sim, { from: 'R1', to: '192.168.3.1', tables: this.tables, cmd: '/ping 192.168.3.1' })
    this.sim = res.state
    res.steps[0] = { ...res.steps[0], title: `Paso 5 · ping · ${res.steps[0].title}` }
    this.steps.push(...res.steps)
    return this
  }
}

export function makeBgp(topo: Topology, opts: BgpOptions): Step[] {
  // El dev() asegura que la topología tenga los routers esperados.
  ;['R1', 'R3'].forEach((id) => dev(topo, id))
  return new BgpSim(topo, opts).run().steps
}
