// Motor de reenvío: ARP + ping salto a salto sobre una topología.
import type { ArpEntry, Device, HeaderLayer, Iface, PacketAnim, Route, Step, TableData, Topology } from './types'
import { inCidr } from './ip'
import { buildTable, lookup, routeFlags } from './routing'

export const BROADCAST_MAC = 'FF:FF:FF:FF:FF:FF'

export interface SimState {
  arp: Record<string, ArpEntry[]>
  routes: Record<string, Route[]>
  down: string[]
}

export function cloneState(s: SimState): SimState {
  return JSON.parse(JSON.stringify(s)) as SimState
}

export function dev(topo: Topology, id: string): Device {
  const d = topo.devices.find((x) => x.id === id)
  if (!d) throw new Error(`No existe el nodo ${id}`)
  return d
}

/** Estado inicial: tablas ARP vacías y tablas de ruteo con conectadas + extras. */
export function initialState(topo: Topology, extra: Record<string, Route[]> = {}, down: string[] = []): SimState {
  const routes: Record<string, Route[]> = {}
  const arp: Record<string, ArpEntry[]> = {}
  for (const d of topo.devices) {
    routes[d.id] = buildTable(d, extra[d.id] ?? [])
    arp[d.id] = []
  }
  return { arp, routes, down: [...down] }
}

export function ownerOf(topo: Topology, ip: string): { dev: Device; iface: Iface } | undefined {
  for (const d of topo.devices) for (const i of d.ifaces) if (i.ip === ip) return { dev: d, iface: i }
  return undefined
}

function owns(d: Device, ip: string): boolean {
  return d.ifaces.some((i) => i.ip === ip)
}

function learn(state: SimState, devId: string, entry: ArpEntry) {
  const t = state.arp[devId]
  const idx = t.findIndex((e) => e.ip === entry.ip)
  if (idx >= 0) t[idx] = entry
  else t.push(entry)
}

export function arpRequestLayers(sender: Iface, targetIp: string): HeaderLayer[] {
  return [
    {
      title: 'Ethernet II',
      fields: [
        { k: 'MAC destino', v: BROADCAST_MAC, hl: true },
        { k: 'MAC origen', v: sender.mac },
        { k: 'EtherType', v: '0x0806 (2054) · ARP' },
      ],
    },
    {
      title: 'ARP',
      fields: [
        { k: 'Operación', v: '1 · request', hl: true },
        { k: 'Sender MAC', v: sender.mac },
        { k: 'Sender IP', v: sender.ip ?? '0.0.0.0' },
        { k: 'Target MAC', v: '00:00:00:00:00:00 (desconocida)' },
        { k: 'Target IP', v: targetIp, hl: true },
      ],
    },
  ]
}

export function arpReplyLayers(sender: Iface, target: Iface): HeaderLayer[] {
  return [
    {
      title: 'Ethernet II',
      fields: [
        { k: 'MAC destino', v: target.mac, hl: true },
        { k: 'MAC origen', v: sender.mac },
        { k: 'EtherType', v: '0x0806 (2054) · ARP' },
      ],
    },
    {
      title: 'ARP',
      fields: [
        { k: 'Operación', v: '2 · reply', hl: true },
        { k: 'Sender MAC', v: sender.mac, hl: true },
        { k: 'Sender IP', v: sender.ip ?? '' },
        { k: 'Target MAC', v: target.mac },
        { k: 'Target IP', v: target.ip ?? '' },
      ],
    },
  ]
}

export function icmpLayers(
  srcMac: string,
  dstMac: string,
  srcIp: string,
  dstIp: string,
  ttl: number,
  type: 'request' | 'reply',
  seq: number,
  ttlChanged: boolean,
): HeaderLayer[] {
  return [
    {
      title: 'Ethernet II',
      fields: [
        { k: 'MAC destino', v: dstMac, hl: true },
        { k: 'MAC origen', v: srcMac, hl: true },
        { k: 'EtherType', v: '0x0800 (2048) · IPv4' },
      ],
    },
    {
      title: 'IPv4',
      fields: [
        { k: 'IP origen', v: srcIp },
        { k: 'IP destino', v: dstIp },
        { k: 'TTL', v: String(ttl), hl: ttlChanged },
        { k: 'Protocolo', v: '1 · ICMP' },
      ],
    },
    {
      title: 'ICMP',
      fields: [
        { k: 'Tipo', v: type === 'request' ? '8 · echo request' : '0 · echo reply' },
        { k: 'Código', v: '0' },
        { k: 'Id / Seq', v: `0x1a2b / ${seq}` },
      ],
    },
  ]
}

export type TablesFn = (topo: Topology, s: SimState) => TableData[]

/** Tablas ARP y de ruteo de cada nodo, con el formato de RouterOS. */
export const defaultTables: TablesFn = (topo, s) => {
  const out: TableData[] = []
  for (const d of topo.devices) {
    out.push({
      id: `arp-${d.id}`,
      group: d.label,
      title: `${d.label} · /ip arp print`,
      columns: ['ADDRESS', 'MAC-ADDRESS', 'INTERFACE'],
      rows: s.arp[d.id].map((e) => [e.ip, e.mac, e.iface]),
      empty: s.down.includes(d.id) ? 'apagado' : 'vacía (ARP se llena por demanda)',
    })
    out.push({
      id: `route-${d.id}`,
      group: d.label,
      title: `${d.label} · /ip route print`,
      columns: ['FLAGS', 'DST-ADDRESS', 'GATEWAY', 'DISTANCE'],
      rows: s.routes[d.id].map((r) => [
        routeFlags(r),
        r.dst,
        r.gateway ? `${r.gateway}${r.iface ? '' : ' (inalcanzable)'}` : r.iface ?? '',
        String(r.distance),
      ]),
    })
  }
  return out
}

export interface PingOptions {
  from: string
  to: string
  count?: number
  ttl?: number
  tables?: TablesFn
  /** Comando que se muestra en el primer paso */
  cmd?: string
}

export interface PingResult {
  steps: Step[]
  state: SimState
  ok: boolean
  /** Líneas de traceroute: IP de entrada de cada router atravesado y el destino */
  hops: string[]
  /** Cantidad de tramas ARP request emitidas */
  arpRequests: number
}

let fidCounter = 0
const nextFid = () => `f${++fidCounter}`

/**
 * Simula `/ping <to> count=N` desde el nodo `from`.
 * Genera un paso por cada trama: ARP request (broadcast), ARP reply (unicast),
 * ICMP echo request/reply salto a salto (MAC reescrita, IP igual, TTL que baja).
 */
export function simulatePing(topo: Topology, start: SimState, opts: PingOptions): PingResult {
  const state = cloneState(start)
  const tables = opts.tables ?? defaultTables
  const steps: Step[] = []
  const ttl0 = opts.ttl ?? 64
  let arpRequests = 0
  const push = (s: Omit<Step, 'tables'>) => steps.push({ ...s, down: [...state.down], tables: tables(topo, state) })

  const origin = dev(topo, opts.from)
  const firstRoute = lookup(state.routes[origin.id], opts.to)
  if (!firstRoute) {
    push({
      title: `${origin.label}: no hay ruta a ${opts.to}`,
      text: `${origin.label} busca ${opts.to} en su tabla de ruteo y no encuentra ninguna red que lo contenga (ni ruta por defecto). El ping ni siquiera sale: RouterOS responde "no route to host".`,
      cmd: opts.cmd,
      packets: [],
      highlight: [origin.id],
      status: 'fail',
    })
    return { steps, state, ok: false, hops: [], arpRequests }
  }
  const srcIp = origin.ifaces.find((i) => i.name === firstRoute.iface)?.ip ?? origin.ifaces.find((i) => i.ip)!.ip!

  type Pkt = { src: string; dst: string; ttl: number; type: 'request' | 'reply'; seq: number }
  const hops: string[] = []

  /** Devuelve el id del nodo donde terminó el paquete o null si se perdió. */
  const forward = (startId: string, pkt: Pkt, recordHops: boolean, isFirstCmd: boolean): string | null => {
    let node = dev(topo, startId)
    let ingress: Iface | undefined
    let originHop = true
    for (let guard = 0; guard < 64; guard++) {
      if (!originHop) {
        if (owns(node, pkt.dst)) {
          if (recordHops) hops.push(pkt.dst)
          return node.id
        }
        if (node.kind === 'host') {
          push({
            title: `${node.label} descarta el paquete`,
            text: `${node.label} es un host: no reenvía paquetes que no son para él.`,
            packets: [],
            highlight: [node.id],
            status: 'fail',
          })
          return null
        }
        if (recordHops && ingress?.ip) hops.push(ingress.ip)
        pkt.ttl -= 1
        if (pkt.ttl <= 0) {
          push({
            title: `${node.label}: TTL llegó a 0`,
            text: `El TTL se agotó en ${node.label}. El paquete se descarta y se avisa al origen con ICMP time exceeded (así funciona traceroute).`,
            packets: [],
            highlight: [node.id],
            status: 'fail',
          })
          return null
        }
      }
      const route = lookup(state.routes[node.id], pkt.dst)
      if (!route) {
        const isReturn = pkt.type === 'reply'
        push({
          title: `${node.label} no tiene ruta a ${pkt.dst}`,
          text: isReturn
            ? `El echo request llegó, pero la respuesta no puede volver: ${node.label} no tiene ninguna ruta hacia ${pkt.dst}. Es el error dominante de P2/P3: falta la ruta de retorno. Desde el origen se ve igual que si no hubiera camino de ida: timeout.`
            : `${node.label} busca ${pkt.dst} en su tabla y no hay ninguna entrada que lo contenga. Descarta el paquete (ICMP destination unreachable). Falta una ruta en ${node.label}.`,
          packets: [],
          highlight: [node.id],
          status: 'fail',
        })
        return null
      }
      const egress = node.ifaces.find((i) => i.name === route.iface)!
      const nh = route.gateway ?? pkt.dst
      // ¿Quién está del otro lado?
      const neighbor = topo.devices.find(
        (d) => d.id !== node.id && d.ifaces.some((i) => i.segment === egress.segment && i.ip === nh),
      )
      const nIface = neighbor?.ifaces.find((i) => i.segment === egress.segment && i.ip === nh)
      const neighborUp = neighbor && !state.down.includes(neighbor.id)
      let entry = state.arp[node.id].find((e) => e.ip === nh)
      const didArp = !entry
      if (!entry) {
        arpRequests++
        const fid = nextFid()
        const receivers = topo.devices.filter(
          (d) => d.id !== node.id && !state.down.includes(d.id) && d.ifaces.some((i) => i.segment === egress.segment),
        )
        const reqPackets: PacketAnim[] = receivers.map((r) => {
          const ri = r.ifaces.find((i) => i.segment === egress.segment)!
          return {
            fid,
            from: node.id,
            to: r.id,
            segment: egress.segment,
            label: 'ARP ¿quién tiene?',
            kind: 'arp-req',
            layers: arpRequestLayers(egress, nh),
            frame: {
              srcMac: egress.mac,
              dstMac: BROADCAST_MAC,
              srcIp: '::',
              dstIp: '::',
              proto: '2054',
              fromIface: egress.name,
              toIface: ri.name,
            },
          }
        })
        const why = route.gateway
          ? `El destino ${pkt.dst} no está en una red conectada: la ruta ${route.dst} dice que hay que entregárselo al gateway ${nh}. Para armar la trama necesita la MAC de ${nh}`
          : `${pkt.dst} está en una red conectada (${route.dst}), así que se entrega directo. Para armar la trama necesita la MAC de ${nh}`
        push({
          title: `${node.label}: ARP request (broadcast) — ¿quién tiene ${nh}?`,
          text: `${why}, y no la tiene en su tabla ARP. Pregunta a todo el segmento: destino FF:FF:FF:FF:FF:FF. ${receivers.length > 1 ? 'Todos los nodos del segmento reciben la pregunta, pero sólo responde el dueño de la IP.' : ''}`,
          cmd: isFirstCmd && steps.length === 0 ? opts.cmd : undefined,
          packets: reqPackets,
          highlight: [node.id],
        })
        if (!neighbor || !neighborUp || !nIface) {
          push({
            title: `Nadie responde el ARP de ${node.label}`,
            text: neighbor
              ? `${neighbor.label} está apagado: nadie contesta por ${nh}. Sin MAC no hay trama, y el ping da timeout. (En P4, OSPF detecta esto solo; con rutas estáticas, la ruta queda apuntando a un router muerto.)`
              : `Ningún nodo del segmento tiene la IP ${nh}. Sin MAC no se puede armar la trama: timeout.`,
            packets: [],
            highlight: [node.id],
            status: 'fail',
          })
          return null
        }
        // El destino del request aprende al que preguntó (así lo hace RouterOS/Linux).
        learn(state, neighbor.id, { ip: egress.ip!, mac: egress.mac, iface: nIface.name })
        learn(state, node.id, { ip: nh, mac: nIface.mac, iface: egress.name })
        push({
          title: `${neighbor.label}: ARP reply (unicast) — "${nh} soy yo"`,
          text: `Sólo responde el dueño de ${nh}, directo a la MAC del que preguntó. ${node.label} guarda ${nh} → ${nIface.mac} en su tabla ARP. Además ${neighbor.label} aprovechó el request y ya cacheó a ${node.label} (${egress.ip} → ${egress.mac}): por eso la vuelta no necesita otro ARP.`,
          packets: [
            {
              fid: nextFid(),
              from: neighbor.id,
              to: node.id,
              segment: egress.segment,
              label: 'ARP reply',
              kind: 'arp-rep',
              layers: arpReplyLayers(nIface, egress),
              frame: {
                srcMac: nIface.mac,
                dstMac: egress.mac,
                srcIp: '::',
                dstIp: '::',
                proto: '2054',
                fromIface: nIface.name,
                toIface: egress.name,
              },
            },
          ],
          highlight: [neighbor.id, node.id],
        })
        entry = state.arp[node.id].find((e) => e.ip === nh)!
      }
      const lost = !neighbor || !neighborUp || !nIface
      const kind = pkt.type === 'request' ? 'icmp-req' : 'icmp-rep'
      const routeTxt = route.gateway
        ? `gana ${route.dst} (${route.proto}${route.proto === 'connected' ? '' : `, distance ${route.distance}`}) → gateway ${route.gateway} por ${route.iface}`
        : `${route.dst} es red conectada en ${route.iface} → entrega directa`
      const text = originHop
        ? `${node.label} arma el ICMP echo ${pkt.type} ${pkt.src} → ${pkt.dst} con TTL ${pkt.ttl}. En la tabla de ruteo ${routeTxt}. La trama va de ${egress.mac} a ${entry.mac}${didArp ? '' : ' (la MAC ya estaba en la caché ARP: no hace falta preguntar)'}.`
        : `${node.label} recibe por ${ingress?.name}. ${pkt.dst} no es suyo, así que rutea: ${routeTxt}. Baja el TTL a ${pkt.ttl} y arma una trama nueva: MAC origen ${egress.mac} (la suya), MAC destino ${entry.mac}. Las IP origen y destino no cambian.`
      push({
        title: `${node.label} → ${neighbor?.label ?? nh}: ICMP echo ${pkt.type} (TTL ${pkt.ttl})`,
        text: lost ? `${text} Pero ${neighbor?.label ?? nh} está apagado: la trama se pierde.` : text,
        cmd: isFirstCmd && steps.length === 0 ? opts.cmd : undefined,
        packets: [
          {
            fid: nextFid(),
            from: node.id,
            to: neighbor?.id ?? node.id,
            segment: egress.segment,
            label: pkt.type === 'request' ? `echo req TTL ${pkt.ttl}` : `echo reply TTL ${pkt.ttl}`,
            kind,
            lost,
            layers: icmpLayers(egress.mac, entry.mac, pkt.src, pkt.dst, pkt.ttl, pkt.type, pkt.seq, !originHop),
            frame: {
              srcMac: egress.mac,
              dstMac: entry.mac,
              srcIp: pkt.src,
              dstIp: pkt.dst,
              proto: '2048',
              fromIface: egress.name,
              toIface: nIface?.name ?? '',
            },
          },
        ],
        highlight: [node.id, ...(neighbor ? [neighbor.id] : [])],
        status: lost ? 'fail' : undefined,
      })
      if (lost) return null
      ingress = nIface
      node = neighbor!
      originHop = false
    }
    return null
  }

  const count = opts.count ?? 1
  let ok = true
  for (let seq = 0; seq < count; seq++) {
    const req: Pkt = { src: srcIp, dst: opts.to, ttl: ttl0, type: 'request', seq }
    const target = forward(origin.id, req, seq === 0, seq === 0)
    if (!target) {
      ok = false
      break
    }
    const reply: Pkt = { src: opts.to, dst: srcIp, ttl: ttl0, type: 'reply', seq }
    const back = forward(target, reply, false, false)
    if (back !== origin.id) {
      ok = false
      break
    }
    push({
      title: `Respuesta ${seq + 1}/${count} recibida en ${origin.label}`,
      text:
        seq === 0
          ? `Ida y vuelta completas: ${hops.length} línea(s) en un traceroute (${hops.join(' → ')}). Las IP origen/destino fueron las mismas en todo el camino; las MAC cambiaron en cada salto.`
          : `Este echo ya no necesitó ARP: todas las MAC estaban cacheadas. Por eso el primer ping suele tardar más que los siguientes.`,
      packets: [],
      highlight: [origin.id],
      status: 'ok',
    })
  }
  if (!ok && steps.length) {
    const last = steps[steps.length - 1]
    last.status = 'fail'
    last.output = `${opts.cmd ?? `/ping ${opts.to}`}\n  SEQ HOST                                     SIZE TTL TIME       STATUS\n    0 ${opts.to.padEnd(40)}                         timeout\n    sent=1 received=0 packet-loss=100%`
  } else if (ok && steps.length) {
    const last = steps[steps.length - 1]
    const ttlBack = ttl0 - Math.max(0, hops.length - 1)
    const lines = Array.from({ length: count }, (_, i) => `    ${i} ${opts.to.padEnd(40)} 56  ${String(ttlBack).padEnd(3)} ${i === 0 ? '1ms' : '0ms'}`)
    last.output = `${opts.cmd ?? `/ping ${opts.to}`}\n  SEQ HOST                                     SIZE TTL TIME\n${lines.join('\n')}\n    sent=${count} received=${count} packet-loss=0%\n\n/tool traceroute ${opts.to}\n${hops.map((h, i) => `  ${String(i + 1).padStart(2)} ${h}`).join('\n')}`
  }
  return { steps, state, ok, hops, arpRequests }
}

/** Simula `/tool arping`: sólo capa 2, no consulta la tabla de ruteo. */
export function simulateArping(topo: Topology, start: SimState, fromId: string, ifaceName: string, ip: string, tables: TablesFn = defaultTables): { steps: Step[]; state: SimState } {
  const state = cloneState(start)
  const steps: Step[] = []
  const origin = dev(topo, fromId)
  const egress = origin.ifaces.find((i) => i.name === ifaceName)!
  const fid = nextFid()
  const receivers = topo.devices.filter((d) => d.id !== origin.id && !state.down.includes(d.id) && d.ifaces.some((i) => i.segment === egress.segment))
  const cmd = `/tool arping interface=${ifaceName} address=${ip}`
  steps.push({
    title: `${origin.label}: arping → ARP request a ${ip}`,
    text: `arping no usa la tabla de ruteo ni ICMP: manda directamente un ARP request por ${ifaceName}. Sólo depende de que los dos estén en el mismo dominio de broadcast (la misma Red Interna). Siempre pregunta, aunque la MAC ya esté cacheada.`,
    cmd,
    packets: receivers.map((r) => ({
      fid,
      from: origin.id,
      to: r.id,
      segment: egress.segment,
      label: 'ARP ¿quién tiene?',
      kind: 'arp-req' as const,
      layers: arpRequestLayers(egress, ip),
      frame: { srcMac: egress.mac, dstMac: BROADCAST_MAC, srcIp: '::', dstIp: '::', proto: '2054', fromIface: ifaceName, toIface: r.ifaces.find((i) => i.segment === egress.segment)!.name },
    })),
    highlight: [origin.id],
    tables: tables(topo, state),
    down: [...state.down],
  })
  const owner = receivers.find((r) => r.ifaces.some((i) => i.ip === ip && i.segment === egress.segment))
  if (!owner) {
    steps.push({ title: 'Sin respuesta', text: `Nadie en el segmento tiene ${ip}. Si arping falla, revisá el nombre de la Red Interna (lan1) en las dos VMs.`, packets: [], tables: tables(topo, state), status: 'fail' })
    return { steps, state }
  }
  const oi = owner.ifaces.find((i) => i.ip === ip)!
  learn(state, owner.id, { ip: egress.ip!, mac: egress.mac, iface: oi.name })
  learn(state, origin.id, { ip, mac: oi.mac, iface: egress.name })
  steps.push({
    title: `${owner.label}: ARP reply con su MAC`,
    text: `Responde ${oi.mac}. arping muestra la MAC del destino: prueba capa 2. Si arping anda y ping no, el cable (Red Interna) está bien y el problema es de capa 3: máscara o subred.`,
    packets: [
      {
        fid: nextFid(),
        from: owner.id,
        to: origin.id,
        segment: egress.segment,
        label: 'ARP reply',
        kind: 'arp-rep',
        layers: arpReplyLayers(oi, egress),
        frame: { srcMac: oi.mac, dstMac: egress.mac, srcIp: '::', dstIp: '::', proto: '2054', fromIface: oi.name, toIface: ifaceName },
      },
    ],
    highlight: [owner.id, origin.id],
    tables: tables(topo, state),
    status: 'ok',
    output: `${cmd}\n  SEQ  ADDRESS        MAC-ADDRESS        TIME   STATUS\n    0  ${ip.padEnd(14)} ${oi.mac}  0ms`,
  })
  return { steps, state }
}

/** Utilidad para tests y páginas: ¿la IP está en alguna red conectada del nodo? */
export function isConnected(d: Device, ip: string): boolean {
  return d.ifaces.some((i) => i.ip && i.prefix !== undefined && inCidr(ip, `${i.ip}/${i.prefix}`))
}
