// Simulación de OSPF (RouterOS 7) sobre el backbone de P3/P4: Hello, elección DR/BDR,
// adyacencias Full, inundación de LSA, SPF y caída de un router.
import type { HeaderLayer, PacketAnim, Route, Step, TableData, Topology } from './types'
import { ipToInt } from './ip'
import { buildTable, routeFlags } from './routing'
import { type SimState, dev, simulatePing } from './net'

export interface OspfRouter {
  id: string
  rid: string
  priority: number
  lan: string
  lanIp: string
  bbIp: string
  mac: string
  advertiseLan: boolean
}

export type Role = 'DR' | 'BDR' | 'DROther'
export type NState = 'Down' | 'Init' | '2-Way' | 'ExStart' | 'Exchange' | 'Loading' | 'Full'

export interface DrBdr {
  dr?: string
  bdr?: string
}

const better = (a: OspfRouter, b: OspfRouter) => b.priority - a.priority || ipToInt(b.rid) - ipToInt(a.rid)

/**
 * Elección de DR/BDR. Gana la prioridad más alta y, si empatan, el router-id más alto.
 * No es preemptiva: si ya hay DR/BDR vivos, se respetan. Si cae el DR, el BDR asciende.
 */
export function electDrBdr(up: OspfRouter[], current: DrBdr = {}): DrBdr {
  const eligible = up.filter((r) => r.priority > 0)
  const alive = (id?: string) => (id && eligible.some((r) => r.id === id) ? id : undefined)
  let dr = alive(current.dr)
  let bdr = alive(current.bdr)
  if (!dr && bdr) {
    dr = bdr
    bdr = undefined
  }
  const sorted = [...eligible].sort(better)
  if (!dr) dr = sorted[0]?.id
  if (!bdr) bdr = sorted.find((r) => r.id !== dr)?.id
  return { dr, bdr }
}

export function roleOf(id: string, e: DrBdr): Role {
  return id === e.dr ? 'DR' : id === e.bdr ? 'BDR' : 'DROther'
}

/** En un segmento broadcast, sólo se llega a Full con el DR y el BDR. */
export function finalState(a: string, b: string, e: DrBdr): NState {
  return [a, b].some((x) => x === e.dr || x === e.bdr) ? 'Full' : '2-Way'
}

/** Rutas OSPF que calcula SPF: cada LAN anunciada por otro router vivo, vía su IP de backbone. */
export function ospfRoutes(self: OspfRouter, up: OspfRouter[]): Route[] {
  return up
    .filter((r) => r.id !== self.id && r.advertiseLan)
    .map((r) => ({ dst: r.lan, gateway: r.bbIp, proto: 'ospf' as const, distance: 110, metric: 2, comment: `aprendida de ${r.rid}` }))
}

export interface Neighbor {
  id: string
  state: NState
}

export interface OspfState {
  up: string[]
  election: DrBdr
  neighbors: Record<string, Neighbor[]>
  lsdb: Record<string, string[]>
  sim: SimState
}

const ALL_SPF = '224.0.0.5'
const ALL_DR = '224.0.0.6'
const mcastMac = (ip: string) => (ip === ALL_SPF ? '01:00:5E:00:00:05' : '01:00:5E:00:00:06')

export function defaultOspfRouters(advertiseLan: Record<string, boolean> = {}): OspfRouter[] {
  return [1, 2, 3, 4].map((n) => ({
    id: `R${n}`,
    rid: `10.10.10.${n}`,
    priority: 1,
    lan: `192.168.${n}.0/24`,
    lanIp: `192.168.${n}.1`,
    bbIp: `10.10.10.${n}`,
    mac: `08:00:27:0${n}:00:02`,
    advertiseLan: advertiseLan[`R${n}`] ?? true,
  }))
}

function ospfLayers(r: OspfRouter, dstIp: string, type: string, body: HeaderLayer, dstMac?: string): HeaderLayer[] {
  return [
    {
      title: 'Ethernet II',
      fields: [
        { k: 'MAC destino', v: dstMac ?? `${mcastMac(dstIp)} (multicast)` },
        { k: 'MAC origen', v: r.mac },
        { k: 'EtherType', v: '0x0800 · IPv4' },
      ],
    },
    {
      title: 'IPv4',
      fields: [
        { k: 'IP origen', v: r.bbIp },
        { k: 'IP destino', v: dstIp, hl: true },
        { k: 'TTL', v: '1 (no sale del segmento)' },
        { k: 'Protocolo', v: '89 · OSPF' },
      ],
    },
    {
      title: 'OSPFv2',
      fields: [
        { k: 'Tipo', v: type, hl: true },
        { k: 'Router-ID', v: r.rid },
        { k: 'Área', v: '0.0.0.0 (backbone)' },
      ],
    },
    body,
  ]
}

export class OspfSim {
  routers: OspfRouter[]
  topo: Topology
  st: OspfState
  steps: Step[] = []
  private fid = 0

  constructor(topo: Topology, routers: OspfRouter[]) {
    this.topo = topo
    this.routers = routers
    const sim: SimState = { arp: {}, routes: {}, down: [] }
    for (const d of topo.devices) {
      sim.arp[d.id] = []
      sim.routes[d.id] = buildTable(d, [])
    }
    this.st = { up: routers.map((r) => r.id), election: {}, neighbors: Object.fromEntries(routers.map((r) => [r.id, []])), lsdb: Object.fromEntries(routers.map((r) => [r.id, []])), sim }
  }

  r(id: string) {
    return this.routers.find((x) => x.id === id)!
  }
  upRouters() {
    return this.routers.filter((r) => this.st.up.includes(r.id))
  }

  tables = (_t: Topology, sim: SimState): TableData[] => {
    const out: TableData[] = []
    for (const r of this.routers) {
      const isDown = !this.st.up.includes(r.id)
      out.push({
        id: `nb-${r.id}`,
        group: r.id,
        title: `${r.id} · /routing ospf neighbor print`,
        columns: ['ROUTER-ID', 'ADDRESS', 'STATE', 'ROL DEL VECINO'],
        rows: isDown
          ? []
          : this.st.neighbors[r.id].map((n) => [this.r(n.id).rid, this.r(n.id).bbIp, n.state, this.st.election.dr ? roleOf(n.id, this.st.election) : '—']),
        empty: isDown ? 'apagado' : 'sin vecinos',
      })
      out.push({
        id: `rt-${r.id}`,
        group: r.id,
        title: `${r.id} · /ip route print`,
        columns: ['FLAGS', 'DST-ADDRESS', 'GATEWAY', 'DIST', 'METRIC'],
        rows: isDown ? [] : sim.routes[r.id].map((x) => [routeFlags(x), x.dst, x.gateway ?? x.iface ?? '', String(x.distance), x.metric !== undefined ? String(x.metric) : '']),
        empty: 'apagado',
      })
      out.push({
        id: `lsdb-${r.id}`,
        group: r.id,
        title: `${r.id} · LSDB (/routing ospf lsa print)`,
        columns: ['LSA'],
        rows: isDown ? [] : this.st.lsdb[r.id].map((l) => [l]),
        empty: isDown ? 'apagado' : 'vacía',
      })
    }
    return out
  }

  push(s: Omit<Step, 'tables'>) {
    this.steps.push({ ...s, down: this.routers.filter((r) => !this.st.up.includes(r.id)).map((r) => r.id), tables: this.tables(this.topo, this.st.sim) })
  }

  private mcast(from: string, dstIp: string, label: string, type: string, body: HeaderLayer, toOnly?: string[], dstMac?: string): PacketAnim[] {
    const fid = `o${++this.fid}`
    const src = this.r(from)
    const receivers = (toOnly ?? this.routers.map((r) => r.id)).filter((id) => id !== from)
    return receivers.map((to) => ({
      fid,
      from,
      to,
      segment: 'backbone',
      label,
      kind: 'ospf' as const,
      lost: !this.st.up.includes(to),
      layers: ospfLayers(src, dstIp, type, body, dstMac),
    }))
  }

  private unicast(from: string, to: string, label: string, type: string, body: HeaderLayer): PacketAnim {
    return { ...this.mcast(from, this.r(to).bbIp, label, type, body, [to], this.r(to).mac)[0] }
  }

  helloBody(r: OspfRouter, seen: string[]): HeaderLayer {
    const e = this.st.election
    return {
      title: 'Hello',
      fields: [
        { k: 'Máscara', v: '255.255.255.0' },
        { k: 'Hello / Dead', v: '10 s / 40 s' },
        { k: 'Prioridad', v: String(r.priority) },
        { k: 'DR', v: e.dr ? this.r(e.dr).bbIp : '0.0.0.0', hl: true },
        { k: 'BDR', v: e.bdr ? this.r(e.bdr).bbIp : '0.0.0.0' },
        { k: 'Vecinos vistos', v: seen.length ? seen.map((id) => this.r(id).rid).join(', ') : '(ninguno todavía)', hl: true },
      ],
    }
  }

  setNeighbors(fn: (a: string, b: string) => NState | null) {
    for (const a of this.st.up) {
      this.st.neighbors[a] = this.st.up
        .filter((b) => b !== a)
        .map((b) => ({ id: b, state: fn(a, b) }))
        .filter((n): n is Neighbor => n.state !== null)
    }
  }

  routerLsa(r: OspfRouter) {
    return `Router-LSA de ${r.rid}: backbone 10.10.10.0/24${r.advertiseLan ? ` + stub ${r.lan}` : ''}`
  }
  networkLsa() {
    const e = this.st.election
    return `Network-LSA del DR ${this.r(e.dr!).rid}: 10.10.10.0/24 con ${this.upRouters().map((r) => r.id).join(', ')}`
  }
  fillLsdb() {
    for (const id of this.st.up) this.st.lsdb[id] = [...this.upRouters().map((r) => this.routerLsa(r)), this.networkLsa()]
  }
  runSpf() {
    const up = this.upRouters()
    for (const r of this.routers) {
      const d = dev(this.topo, r.id)
      this.st.sim.routes[r.id] = this.st.up.includes(r.id) ? buildTable(d, ospfRoutes(r, up)) : []
    }
  }
  fullPairs(): [string, string][] {
    const out: [string, string][] = []
    const ids = this.st.up
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (finalState(ids[i], ids[j], this.st.election) === 'Full') out.push([ids[i], ids[j]])
    return out
  }
  /** Las adyacencias usan unicast (DBD/LSR), así que cada par Full ya cacheó la MAC del otro. */
  arpForPairs(pairs: [string, string][]) {
    for (const [a, b] of pairs) {
      const ra = this.r(a)
      const rb = this.r(b)
      const add = (x: string, ip: string, mac: string) => {
        if (!this.st.sim.arp[x].some((e) => e.ip === ip)) this.st.sim.arp[x].push({ ip, mac, iface: 'ether2' })
      }
      add(a, rb.bbIp, rb.mac)
      add(b, ra.bbIp, ra.mac)
    }
  }

  ping(from: string, to: string, title?: string) {
    const res = simulatePing(this.topo, this.st.sim, { from, to, tables: this.tables, cmd: `/ping ${to}` })
    // El ping no cambia el estado de OSPF, pero sí la caché ARP.
    const steps = res.steps.map((s, i) => (i === 0 && title ? { ...s, title: `${title} · ${s.title}` } : s))
    this.st.sim = res.state
    this.steps.push(...steps)
    return res
  }

  // ------------------------- escenarios -------------------------

  /** Convergencia desde cero (pasos 1 a 6 de la guía). */
  converge() {
    this.push({
      title: 'Punto de partida: sin estáticas',
      text: 'Se borraron las rutas estáticas de P3 (/ip route remove [find comment~"LAN R"]). Cada router conoce sólo sus dos redes conectadas: el backbone y su LAN. El ping al backbone anda; a otra LAN, no.',
      cmd: '/ip route print\n/ip route remove [find comment~"LAN R"]',
      packets: [],
      status: 'info',
    })
    this.ping('R1', '192.168.3.1', 'Antes de OSPF')
    this.push({
      title: 'Configurar OSPF en los cuatro routers',
      text: 'Tres cosas por router: una instancia con su router-id (convención: la IP de backbone), el área backbone 0.0.0.0, y dos interface-template — el backbone (por donde salen los Hello) y la LAN propia (lo que se anuncia).',
      cmd: '# en R2; en los otros cambia el último octeto y la LAN\n/routing ospf instance add name=default router-id=10.10.10.2\n/routing ospf area add name=backbone area-id=0.0.0.0 instance=default\n/routing ospf interface-template add networks=10.10.10.0/24 area=backbone\n/routing ospf interface-template add networks=192.168.2.0/24 area=backbone',
      packets: [],
      status: 'info',
    })
    // Primera ronda de Hello: nadie vio a nadie todavía.
    const first: PacketAnim[] = []
    for (const r of this.upRouters()) first.push(...this.mcast(r.id, ALL_SPF, 'Hello', '1 · Hello', this.helloBody(r, [])))
    this.setNeighbors(() => 'Init')
    this.push({
      title: 'Primera ronda de Hello (multicast 224.0.0.5)',
      text: 'Cada router manda un Hello a 224.0.0.5 (AllSPFRouters) cada 10 s por el backbone. No hay que declarar vecinos: el que escucha un Hello con la misma área, máscara y timers lo anota en estado Init ("te escuché, pero vos todavía no me nombrás").',
      packets: first,
    })
    const second: PacketAnim[] = []
    for (const r of this.upRouters()) second.push(...this.mcast(r.id, ALL_SPF, 'Hello', '1 · Hello', this.helloBody(r, this.st.up.filter((x) => x !== r.id))))
    this.setNeighbors(() => '2-Way')
    this.push({
      title: 'Segunda ronda: cada uno se ve nombrado → 2-Way',
      text: 'Ahora cada Hello lista a los vecinos que ya escuchó. Cuando un router se ve a sí mismo en el Hello de otro, la comunicación es bidireccional: 2-Way. Todavía no intercambiaron ningún mapa.',
      packets: second,
    })
    this.st.election = electDrBdr(this.upRouters())
    const e = this.st.election
    this.push({
      title: `Elección: ${e.dr} = DR, ${e.bdr} = BDR`,
      text: `El backbone es un segmento compartido: en vez de sincronizar todos con todos (N×(N−1)/2 adyacencias) OSPF elige un DR y un BDR. Prioridades iguales (1) → gana el router-id más alto: ${this.r(e.dr!).rid} es DR y ${this.r(e.bdr!).rid} es BDR. ${this.upRouters().filter((r) => roleOf(r.id, e) === 'DROther').map((r) => r.id).join(' y ')} quedan como DROther.`,
      packets: [],
      highlight: [e.dr!, e.bdr!],
    })
    const pairs = this.fullPairs()
    const dbd: PacketAnim[] = pairs.map(([a, b]) =>
      this.unicast(a, b, 'DBD', '2 · Database Description', { title: 'DBD', fields: [{ k: 'Contenido', v: 'resumen (cabeceras) de las LSA que conozco' }, { k: 'Flags', v: 'I/M/MS: negociación maestro/esclavo' }] }),
    )
    this.arpForPairs(pairs)
    this.setNeighbors((a, b) => (finalState(a, b, e) === 'Full' ? 'Exchange' : '2-Way'))
    this.push({
      title: 'ExStart / Exchange: intercambio de DBD (unicast)',
      text: `Sólo los pares que involucran al DR o al BDR avanzan: ${pairs.map((p) => p.join('↔')).join(', ')}. Se mandan Database Description: el "índice" de su base de estado de enlace. Los dos DROther se quedan en 2-Way entre sí — y es correcto.`,
      packets: dbd,
    })
    const lsr: PacketAnim[] = pairs.flatMap(([a, b]) => [
      this.unicast(a, b, 'LSR', '3 · Link State Request', { title: 'LSR', fields: [{ k: 'Pide', v: `las LSA que le faltan de ${b}` }] }),
    ])
    this.setNeighbors((a, b) => (finalState(a, b, e) === 'Full' ? 'Loading' : '2-Way'))
    this.push({
      title: 'Loading: cada uno pide lo que le falta (LSR)',
      text: 'Comparando los DBD, cada router pide con Link State Request las LSA que no tiene. Le contestan con Link State Update.',
      packets: lsr,
    })
    // Inundación: cada router manda su Router-LSA a AllDRouters; el DR la reinunda a todos.
    const toDr: PacketAnim[] = []
    for (const r of this.upRouters()) {
      if (r.id === e.dr) continue
      toDr.push(...this.mcast(r.id, ALL_DR, 'LSU', '4 · Link State Update', { title: 'LSU', fields: [{ k: 'LSA', v: this.routerLsa(r), hl: true }] }, [e.dr!, e.bdr!].filter((x) => x !== r.id)))
    }
    this.push({
      title: 'Inundación: Router-LSA hacia el DR/BDR (224.0.0.6)',
      text: 'Cada router describe sus enlaces en una Router-LSA: "estoy en el backbone y tengo la LAN 192.168.n.0/24". Los DROther se la mandan a 224.0.0.6 (AllDRouters): sólo el DR y el BDR la escuchan.',
      packets: toDr,
    })
    this.fillLsdb()
    this.setNeighbors((a, b) => finalState(a, b, e))
    const dr = this.r(e.dr!)
    this.push({
      title: `El DR reinunda a todos (224.0.0.5) → Full`,
      text: `${dr.id} (DR) reenvía las LSA a 224.0.0.5 y agrega la Network-LSA del segmento. Al terminar, los cuatro tienen la misma LSDB (el mismo mapa). DR y BDR muestran 3 vecinos en Full; ${this.upRouters().filter((r) => roleOf(r.id, e) === 'DROther').map((r) => r.id).join(' y ')} muestran 2 en Full y 1 en 2-Way.`,
      packets: this.mcast(dr.id, ALL_SPF, 'LSU', '4 · Link State Update', { title: 'LSU', fields: [{ k: 'LSA', v: 'todas las Router-LSA + Network-LSA', hl: true }] }),
      highlight: [dr.id],
    })
    this.runSpf()
    this.push({
      title: 'SPF: cada router calcula su tabla',
      text: 'Con el mapa completo, cada router corre Dijkstra (SPF) y arma las rutas: cada LAN remota con protocolo OSPF (flag o), distance 110 y gateway = la IP de backbone de su dueño. Es exactamente lo que escribiste a mano en P3 — esta vez lo puso el protocolo.',
      cmd: '/routing ospf neighbor print\n/ip route print where ospf',
      packets: [],
      status: 'ok',
    })
    this.ping('R1', '192.168.3.1', 'Con OSPF')
    return this
  }

  /** Estado convergido directo, sin animar (punto de partida de los escenarios de falla). */
  convergeSilently() {
    this.st.election = electDrBdr(this.upRouters())
    this.setNeighbors((a, b) => finalState(a, b, this.st.election))
    this.fillLsdb()
    this.runSpf()
    this.arpForPairs(this.fullPairs())
    return this
  }

  /** Paso 8 de la guía: apagar un router y cronometrar. */
  failRouter(victim: string, probeFrom: string) {
    const before = { ...this.st.election }
    const v = this.r(victim)
    this.push({
      title: 'Red convergida',
      text: `DR = ${before.dr}, BDR = ${before.bdr}. Todas las LAN están en todas las tablas. Ahora vas a apagar ${victim} desde VirtualBox.`,
      packets: [],
      status: 'info',
    })
    this.st.up = this.st.up.filter((x) => x !== victim)
    this.st.sim.down = [victim]
    this.st.sim.arp[victim] = []
    this.st.lsdb[victim] = []
    this.st.neighbors[victim] = []
    this.push({
      title: `${victim} se apaga`,
      text: `${victim} deja de mandar Hello. Los demás todavía no lo saben: siguen con ${victim} en su tabla de vecinos y con la ruta a ${v.lan}. Con rutas estáticas, quedaría así para siempre.`,
      packets: [],
      highlight: [victim],
      status: 'fail',
    })
    const hellos: PacketAnim[] = []
    for (const r of this.upRouters()) hellos.push(...this.mcast(r.id, ALL_SPF, 'Hello', '1 · Hello', this.helloBody(r, this.routers.filter((x) => x.id !== r.id).map((x) => x.id))))
    this.push({
      title: 'Pasan los Hello… sin respuesta de ' + victim,
      text: `Cada 10 s los vivos mandan su Hello. El de ${victim} no llega. El dead interval es 40 s (4 Hello perdidos): durante ese tiempo el ping a ${v.lan} falla y la tabla todavía tiene la ruta.`,
      packets: hellos,
    })
    // Dead interval vencido
    for (const id of this.st.up) this.st.neighbors[id] = this.st.neighbors[id].filter((n) => n.id !== victim)
    const after = electDrBdr(this.upRouters(), before)
    const roleChange = after.dr !== before.dr || after.bdr !== before.bdr
    this.st.election = after
    this.push({
      title: `≈40 s: dead interval vencido → ${victim} declarado caído`,
      text: roleChange
        ? `Se borra ${victim} de las tablas de vecinos. Como era ${before.dr === victim ? 'el DR' : 'el BDR'}, hay nueva elección: ${before.dr === victim ? `el BDR ${after.dr} asciende a DR y ` : ''}${after.bdr} pasa a BDR (el router-id más alto que queda). La elección no es preemptiva: los que ya tenían rol lo conservan.`
        : `Se borra ${victim} de las tablas de vecinos. Era DROther, así que DR (${after.dr}) y BDR (${after.bdr}) no cambian.`,
      packets: [],
      highlight: [after.dr!, after.bdr!].filter(Boolean),
    })
    if (roleChange) {
      const newPairs = this.fullPairs().filter(([a, b]) => !this.st.neighbors[a].some((n) => n.id === b && n.state === 'Full'))
      this.arpForPairs(newPairs)
      this.setNeighbors((a, b) => finalState(a, b, after))
      this.push({
        title: 'Nuevas adyacencias con el nuevo DR/BDR',
        text: newPairs.length
          ? `Los pares que antes eran 2-Way y ahora involucran al nuevo DR/BDR sincronizan (DBD/LSR/LSU) y llegan a Full: ${newPairs.map((p) => p.join('↔')).join(', ')}.`
          : 'Las adyacencias existentes ya alcanzan.',
        packets: newPairs.map(([a, b]) => this.unicast(a, b, 'DBD', '2 · Database Description', { title: 'DBD', fields: [{ k: 'Contenido', v: 'resumen de la LSDB' }] })),
      })
    }
    const dr = this.r(after.dr!)
    this.fillLsdb()
    this.push({
      title: `${dr.id} (DR) inunda el cambio`,
      text: `El DR genera una Network-LSA nueva sin ${victim} y la inunda a 224.0.0.5. La Router-LSA de ${victim} queda inalcanzable y SPF la ignora.`,
      packets: this.mcast(dr.id, ALL_SPF, 'LSU', '4 · Link State Update', { title: 'LSU', fields: [{ k: 'LSA', v: this.networkLsa(), hl: true }] }),
      highlight: [dr.id],
    })
    this.runSpf()
    this.push({
      title: `SPF otra vez: ${v.lan} desaparece`,
      text: `El recálculo es inmediato. La ruta a ${v.lan} desaparece de las tablas de los tres que quedan; las demás siguen intactas. Nadie tocó nada.`,
      cmd: '/ip route print where ospf',
      packets: [],
      status: 'info',
    })
    this.ping(probeFrom, v.lanIp, `${victim} caído`)
    // Vuelve
    this.st.up = this.routers.filter((r) => r.id === victim || this.st.up.includes(r.id)).map((r) => r.id)
    this.st.sim.down = []
    const e = this.st.election
    this.setNeighbors((a, b) => {
      if (a === victim || b === victim) return 'Init'
      return finalState(a, b, e)
    })
    this.push({
      title: `Prendés ${victim} de nuevo`,
      text: `${victim} arranca y manda Hello. En los Hello que recibe ve que ya hay DR (${e.dr}) y BDR (${e.bdr}): no los desplaza aunque su router-id sea más alto (no preemptivo). Queda como DROther.`,
      packets: this.mcast(victim, ALL_SPF, 'Hello', '1 · Hello', this.helloBody(v, [])),
      highlight: [victim],
    })
    const pairs = this.fullPairs().filter(([a, b]) => a === victim || b === victim)
    this.arpForPairs(pairs)
    this.setNeighbors((a, b) => finalState(a, b, e))
    this.fillLsdb()
    this.runSpf()
    this.push({
      title: `${victim} vuelve a Full con DR y BDR, y su LAN reaparece`,
      text: `Sincroniza con el DR y el BDR (${pairs.map((p) => p.join('↔')).join(', ')}), su Router-LSA se inunda y todos recalculan. ${v.lan} vuelve sola a las tablas.`,
      packets: pairs.map(([a, b]) => this.unicast(a === victim ? a : b, a === victim ? b : a, 'DBD/LSU', '2/4 · DBD + LSU', { title: 'Sincronización', fields: [{ k: 'LSA', v: this.routerLsa(v), hl: true }] })),
      status: 'ok',
    })
    this.ping(probeFrom, v.lanIp, `${victim} de vuelta`)
    return this
  }

  /** Error típico: un router no anunció su LAN. */
  missingLan(culprit: string, probeFrom: string) {
    const c = this.r(culprit)
    this.push({
      title: `${culprit} no anunció su LAN`,
      text: `En ${culprit} falta la segunda línea del paso 4 (interface-template networks=${c.lan}). Los Hello salen por el backbone, así que las adyacencias se forman perfectas: todos los vecinos en Full/2-Way como corresponde.`,
      cmd: `# en ${culprit} sólo se cargó:\n/routing ospf interface-template add networks=10.10.10.0/24 area=backbone`,
      packets: [],
      status: 'info',
    })
    this.push({
      title: 'Vecinos perfectos, tabla incompleta',
      text: `Mirá las tablas: ${c.lan} no está en ninguna. La Router-LSA de ${culprit} sólo describe el backbone. "La red funciona y una subred es inalcanzable": no mires los vecinos, mirá qué anunciaste.`,
      cmd: '/routing ospf neighbor print\n/ip route print where ospf',
      packets: [],
      status: 'fail',
    })
    this.ping(probeFrom, c.lanIp, 'LAN sin anunciar')
    return this
  }
}
