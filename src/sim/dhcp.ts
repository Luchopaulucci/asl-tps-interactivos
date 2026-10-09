// DHCP (DORA) e IPoE de P6: servidor en R1, cliente C1 en lan1 o abonado R2 en vlan-acceso.
import type { HeaderLayer, PacketAnim, Step, TableData, Topology } from './types'
import { intToIp, ipToInt } from './ip'

// ---------------- lógica pura (testeada) ----------------

export interface Pool {
  name: string
  start: string
  end: string
}

export interface Lease {
  address: string
  mac: string
  server: string
  status: 'offered' | 'bound'
  expires: string
}

/**
 * Elige una dirección libre del pool para esa MAC. Si la MAC ya tiene lease, devuelve la misma.
 * RouterOS suele entregar desde el final del rango hacia abajo; la guía sólo exige que esté
 * dentro de 192.168.1.100–200.
 */
export function allocate(pool: Pool, leases: Lease[], mac: string): string | null {
  const mine = leases.find((l) => l.mac === mac)
  if (mine) return mine.address
  const used = new Set(leases.map((l) => l.address))
  for (let n = ipToInt(pool.end); n >= ipToInt(pool.start); n--) {
    const ip = intToIp(n)
    if (!used.has(ip)) return ip
  }
  return null
}

export type ClientState = 'INIT' | 'SELECTING' | 'REQUESTING' | 'BOUND' | 'RENEWING'
export type ClientEvent = 'send-discover' | 'recv-offer' | 'send-request' | 'recv-ack' | 'recv-nak' | 't1' | 'timeout'

/** Máquina de estados del cliente DHCP (RFC 2131, simplificada). */
export function clientNext(s: ClientState, e: ClientEvent): ClientState {
  switch (s) {
    case 'INIT':
      return e === 'send-discover' ? 'SELECTING' : s
    case 'SELECTING':
      if (e === 'recv-offer' || e === 'send-request') return 'REQUESTING'
      if (e === 'timeout') return 'SELECTING'
      return s
    case 'REQUESTING':
      if (e === 'recv-ack') return 'BOUND'
      if (e === 'recv-nak' || e === 'timeout') return 'INIT'
      return s
    case 'BOUND':
      return e === 't1' ? 'RENEWING' : s
    case 'RENEWING':
      if (e === 'recv-ack') return 'BOUND'
      if (e === 'recv-nak') return 'INIT'
      return s
  }
}

/** DORA completo como secuencia de mensajes, para validar el orden. */
export const DORA = ['DHCPDISCOVER', 'DHCPOFFER', 'DHCPREQUEST', 'DHCPACK'] as const

// ---------------- simulación paso a paso ----------------

export type DhcpScenario = 'lan' | 'lan-no-network' | 'ipoe' | 'ipoe-vlan-mismatch'

interface Ctx {
  server: string
  iface: string
  pool: Pool
  gw: string
  net: string
  clientId: string
  clientLabel: string
  clientMac: string
  clientIface: string
  serverMac: string
  vlan?: number
  clientVlan?: number
  network: boolean
}

const XID = '0x3903F326'

export class DhcpSim {
  steps: Step[] = []
  leases: Lease[] = []
  client: { state: ClientState; ip?: string; gw?: string; dns?: string; routes: string[] } = { state: 'INIT', routes: [] }
  ctx: Ctx
  topoFn: (clientIp?: string) => Topology
  private fid = 0

  constructor(scn: DhcpScenario, topoFn: (c1?: string, r2?: string, vlan?: number) => Topology, macs: { c1: string; r2: string; r1lan: string; r1acc: string }) {
    const ipoe = scn.startsWith('ipoe')
    this.ctx = ipoe
      ? {
          server: 'dhcp-acceso',
          iface: 'vlan-acceso',
          pool: { name: 'pool-ipoe', start: '100.64.1.10', end: '100.64.1.100' },
          gw: '100.64.1.1',
          net: '100.64.1.0/24',
          clientId: 'R2',
          clientLabel: 'R2 (abonado)',
          clientMac: macs.r2,
          clientIface: 'vlan-acceso',
          serverMac: macs.r1acc,
          vlan: 100,
          clientVlan: scn === 'ipoe-vlan-mismatch' ? 200 : 100,
          network: true,
        }
      : {
          server: 'dhcp-lan1',
          iface: 'ether3',
          pool: { name: 'pool-dhcp', start: '192.168.1.100', end: '192.168.1.200' },
          gw: '192.168.1.1',
          net: '192.168.1.0/24',
          clientId: 'C1',
          clientLabel: 'C1',
          clientMac: macs.c1,
          clientIface: 'ether2',
          serverMac: macs.r1lan,
          network: scn !== 'lan-no-network',
        }
    const vlan = this.ctx.clientVlan
    this.topoFn = (ip?: string) => (ipoe ? topoFn(undefined, ip, vlan) : topoFn(ip, undefined, vlan))
  }

  tables(): TableData[] {
    const c = this.ctx
    return [
      {
        id: 'leases',
        group: 'R1 (servidor)',
        title: 'R1 · /ip dhcp-server lease print',
        columns: ['ADDRESS', 'MAC-ADDRESS', 'SERVER', 'STATUS', 'EXPIRES-AFTER'],
        rows: this.leases.map((l) => [l.address, l.mac, l.server, l.status, l.expires]),
        empty: 'sin leases',
      },
      {
        id: 'server',
        group: 'R1 (servidor)',
        title: 'R1 · los tres objetos',
        columns: ['OBJETO', 'CONFIG'],
        rows: [
          ['/ip pool', `${c.pool.name} ${c.pool.start}-${c.pool.end}`],
          ['/ip dhcp-server network', c.network ? `${c.net} gateway=${c.gw} dns-server=${c.gw}` : `${c.net} (DESHABILITADO)`],
          ['/ip dhcp-server', `${c.server} interface=${c.iface} address-pool=${c.pool.name}`],
          ...(c.vlan ? [['/interface vlan', `vlan-acceso interface=ether2 vlan-id=${c.vlan}`]] : []),
        ],
      },
      {
        id: 'client',
        group: `${c.clientId} (cliente)`,
        title: `${c.clientId} · estado del cliente DHCP`,
        columns: ['ESTADO', 'DIRECCIÓN', 'GATEWAY', 'DNS'],
        rows: [[this.client.state, this.client.ip ? `${this.client.ip}/24` : '—', this.client.gw ?? '—', this.client.dns ?? '—']],
      },
      {
        id: 'client-routes',
        group: `${c.clientId} (cliente)`,
        title: `${c.clientId} · tabla de ruteo`,
        columns: ['DESTINO', 'VÍA'],
        rows: this.client.routes.map((r) => r.split('|')),
        empty: 'vacía (sin dirección todavía)',
      },
    ]
  }

  push(s: Omit<Step, 'tables'>) {
    this.steps.push({ ...s, tables: this.tables(), topo: this.topoFn(this.client.ip) })
  }

  dhcpLayers(opts: {
    type: string
    fromClient: boolean
    srcIp: string
    dstIp: string
    dstMac: string
    ciaddr?: string
    yiaddr?: string
    options: { k: string; v: string; hl?: boolean }[]
  }): HeaderLayer[] {
    const c = this.ctx
    const eth: HeaderLayer = {
      title: 'Ethernet II',
      fields: [
        { k: 'MAC destino', v: opts.dstMac, hl: true },
        { k: 'MAC origen', v: opts.fromClient ? c.clientMac : c.serverMac },
        ...(c.vlan ? [{ k: '802.1Q VLAN', v: `VID ${opts.fromClient ? c.clientVlan : c.vlan}`, hl: true }] : []),
        { k: 'EtherType', v: '0x0800 · IPv4' },
      ],
    }
    return [
      eth,
      {
        title: 'IPv4 / UDP',
        fields: [
          { k: 'IP origen', v: opts.srcIp, hl: true },
          { k: 'IP destino', v: opts.dstIp, hl: true },
          { k: 'UDP', v: opts.fromClient ? '68 → 67' : '67 → 68' },
        ],
      },
      {
        title: 'DHCP',
        fields: [
          { k: 'op', v: opts.fromClient ? '1 · BOOTREQUEST' : '2 · BOOTREPLY' },
          { k: 'xid', v: XID, hl: true },
          { k: 'ciaddr', v: opts.ciaddr ?? '0.0.0.0' },
          { k: 'yiaddr', v: opts.yiaddr ?? '0.0.0.0', hl: !!opts.yiaddr },
          { k: 'chaddr', v: c.clientMac },
          { k: 'Opción 53', v: opts.type, hl: true },
          ...opts.options,
        ],
      },
    ]
  }

  pkt(fromClient: boolean, label: string, layers: HeaderLayer[], lost = false): PacketAnim {
    const c = this.ctx
    return {
      fid: `d${++this.fid}`,
      from: fromClient ? c.clientId : 'R1',
      to: fromClient ? 'R1' : c.clientId,
      segment: c.vlan ? 'acceso' : 'lan1',
      label,
      kind: 'dhcp',
      layers,
      lost,
    }
  }

  serverOptions(full: boolean) {
    const c = this.ctx
    return [
      { k: 'Opción 54 · server id', v: c.gw },
      { k: 'Opción 51 · lease time', v: '1800 s (30m)' },
      { k: 'Opción 1 · máscara', v: '255.255.255.0' },
      ...(full
        ? [
            { k: 'Opción 3 · router (gateway)', v: c.gw, hl: true },
            { k: 'Opción 6 · DNS', v: c.gw },
          ]
        : [{ k: 'Opción 3 / 6', v: '(no van: falta el objeto network)', hl: true }]),
    ]
  }

  run(scn: DhcpScenario) {
    const c = this.ctx
    const ipoe = !!c.vlan
    this.push({
      title: ipoe ? 'IPoE · el mismo servidor sobre vlan-acceso' : 'DHCP en lan1 · los tres objetos en R1',
      text: ipoe
        ? 'Es el servidor del paso 4 con tres cosas cambiadas: interface= (vlan-acceso en vez de ether3), el rango (100.64.1.0/24, RFC 6598, el que P7 traduce con CGNAT) y el nombre. Escucha en la VLAN 100 por la que llegan los abonados de toda una zona.'
        : `Pool (qué prestar), network (gateway, DNS y máscara) y dhcp-server (en qué interfaz escucha). El pool arranca en .100 para no pisar el .10 que usan las otras prácticas como IP fija.${c.network ? '' : ' En esta variante el objeto network está deshabilitado.'}`,
      cmd: ipoe
        ? '/interface vlan add name=vlan-acceso interface=ether2 vlan-id=100\n/ip pool add name=pool-ipoe ranges=100.64.1.10-100.64.1.100\n/ip address add address=100.64.1.1/24 interface=vlan-acceso comment="acceso IPoE"\n/ip dhcp-server network add address=100.64.1.0/24 gateway=100.64.1.1 dns-server=100.64.1.1\n/ip dhcp-server add name=dhcp-acceso interface=vlan-acceso address-pool=pool-ipoe disabled=no'
        : `/ip pool add name=pool-dhcp ranges=192.168.1.100-192.168.1.200\n/ip address add address=192.168.1.1/24 interface=ether3 comment="LAN1 (DHCP)"\n/ip dhcp-server network add address=192.168.1.0/24 gateway=192.168.1.1 dns-server=192.168.1.1\n/ip dhcp-server add name=dhcp-lan1 interface=ether3 address-pool=pool-dhcp disabled=no${c.network ? '' : '\n/ip dhcp-server network disable [find address=192.168.1.0/24]'}`,
      packets: [],
      status: 'info',
    })
    const clientCmd = ipoe
      ? `/interface vlan add name=vlan-acceso interface=ether2 vlan-id=${c.clientVlan}\n/ip dhcp-client add interface=vlan-acceso add-default-route=yes disabled=no`
      : '/ip dhcp-client add interface=ether2 disabled=no    # si C1 es una CHR\nudhcpc -i eth1                                    # Alpine / busybox\ndhclient -v eth0                                  # Debian y derivados'
    this.client.state = clientNext(this.client.state, 'send-discover')
    const discover = () =>
      this.dhcpLayers({
        type: 'DHCPDISCOVER',
        fromClient: true,
        srcIp: '0.0.0.0',
        dstIp: '255.255.255.255',
        dstMac: 'FF:FF:FF:FF:FF:FF',
        options: [
          { k: 'Opción 55 · pide', v: 'máscara, router, DNS' },
          { k: 'Flags', v: 'broadcast' },
        ],
      })
    if (scn === 'ipoe-vlan-mismatch') {
      this.push({
        title: 'D · Discover etiquetado con VID 200',
        text: `${c.clientLabel} configuró su VLAN con vlan-id=200 y R1 escucha en la 100. El Discover sale por el cable con la etiqueta 200: para R1 es tráfico de otra red y lo descarta sin decir nada.`,
        cmd: clientCmd,
        packets: [this.pkt(true, 'DISCOVER (VID 200)', discover(), true)],
        status: 'fail',
      })
      this.client.state = clientNext(this.client.state, 'timeout')
      this.push({
        title: 'Reintento… y nada',
        text: 'El cliente reintenta el Discover con back-off. Ninguna respuesta. En el log del cliente sólo se ve que busca servidor; ningún log menciona la palabra «VLAN». Primer lugar a mirar: /interface vlan print en las dos puntas.',
        cmd: '/interface vlan print',
        packets: [this.pkt(true, 'DISCOVER (VID 200)', discover(), true)],
        status: 'fail',
        output: '# R2\n name=vlan-acceso vlan-id=200 interface=ether2\n# R1\n name=vlan-acceso vlan-id=100 interface=ether2',
      })
      return this
    }
    this.push({
      title: 'D · Discover (broadcast)',
      text: `${c.clientLabel} no tiene IP, ni sabe quién es el servidor: grita a todo el segmento. IP origen 0.0.0.0, destino 255.255.255.255, MAC destino FF:FF:FF:FF:FF:FF, UDP 68→67. El xid ${XID} identifica esta transacción: todas las respuestas lo repiten.${ipoe ? ' La trama va etiquetada con la VLAN 100: los switches del medio sólo ven "tráfico de la VLAN 100".' : ''}`,
      cmd: clientCmd,
      packets: [this.pkt(true, 'DISCOVER', discover())],
      highlight: [c.clientId],
    })
    const ip = allocate(c.pool, this.leases, c.clientMac)!
    this.leases.push({ address: ip, mac: c.clientMac, server: c.server, status: 'offered', expires: '30s' })
    this.client.state = clientNext(this.client.state, 'recv-offer')
    this.push({
      title: `O · Offer: "te ofrezco ${ip}"`,
      text: `R1 recibe el Discover en ${c.iface}, la interfaz donde escucha ${c.server}. Toma una dirección libre de ${c.pool.name} y la reserva por unos segundos (status offered). La oferta lleva yiaddr=${ip} y, ${c.network ? 'gracias al objeto network, gateway, DNS y máscara' : 'como el network está deshabilitado, sólo la máscara: ni gateway ni DNS'}. Va dirigida a la MAC del cliente (todavía no tiene IP para recibir otra cosa).`,
      packets: [
        this.pkt(
          false,
          `OFFER ${ip}`,
          this.dhcpLayers({ type: 'DHCPOFFER', fromClient: false, srcIp: c.gw, dstIp: '255.255.255.255', dstMac: c.clientMac, yiaddr: ip, options: this.serverOptions(c.network) }),
        ),
      ],
      highlight: ['R1'],
    })
    this.push({
      title: `R · Request (broadcast): "sí, quiero ${ip}"`,
      text: `El cliente acepta. Todavía no puede usar la IP, así que el Request también va en broadcast, con la opción 50 (IP pedida) y la 54 (a qué servidor le acepta). Si hubiera dos servidores, el otro se entera de que no fue elegido.`,
      packets: [
        this.pkt(
          true,
          'REQUEST',
          this.dhcpLayers({
            type: 'DHCPREQUEST',
            fromClient: true,
            srcIp: '0.0.0.0',
            dstIp: '255.255.255.255',
            dstMac: 'FF:FF:FF:FF:FF:FF',
            options: [
              { k: 'Opción 50 · IP pedida', v: ip, hl: true },
              { k: 'Opción 54 · server id', v: c.gw },
            ],
          }),
        ),
      ],
      highlight: [c.clientId],
    })
    this.leases[0].status = 'bound'
    this.leases[0].expires = '29m59s'
    this.client.state = clientNext(this.client.state, 'recv-ack')
    this.client.ip = ip
    this.client.gw = c.network ? c.gw : undefined
    this.client.dns = c.network ? c.gw : undefined
    this.client.routes = [`${c.net}|conectada (${c.clientIface})`, ...(c.network ? [`0.0.0.0/0|${c.gw} (dhcp)`] : [])]
    this.push({
      title: `A · Ack: el lease queda bound`,
      text: `R1 confirma. El cliente configura ${ip}/24${c.network ? `, ruta por defecto vía ${c.gw} y DNS ${c.gw}` : ' y nada más'}. En R1 el lease pasa a bound, con la MAC del cliente. ${ipoe ? 'Fijate: el único dato que el ISP tiene del abonado es su MAC. No entregó ninguna credencial.' : ''}`,
      cmd: ipoe ? '/ip dhcp-server lease print where server=dhcp-acceso' : '/ip dhcp-server lease print',
      packets: [
        this.pkt(
          false,
          `ACK ${ip}`,
          this.dhcpLayers({ type: 'DHCPACK', fromClient: false, srcIp: c.gw, dstIp: '255.255.255.255', dstMac: c.clientMac, yiaddr: ip, options: this.serverOptions(c.network) }),
        ),
      ],
      status: 'ok',
      output: `Flags: D - DYNAMIC\n  ADDRESS         MAC-ADDRESS        SERVER       STATUS\nD ${ip.padEnd(15)} ${c.clientMac}  ${c.server.padEnd(12)} bound`,
    })
    if (!c.network) {
      this.push({
        title: 'Tengo IP pero no tengo internet',
        text: 'El cliente tiene dirección y máscara, así que llega a sus vecinos de la LAN. Pero no aprendió gateway ni DNS: no hay ruta por defecto y no sale a ningún lado. Ninguna pantalla muestra un error. Es el reclamo más común de un soporte de ISP. Volvé a habilitar el network y renová: esa comparación es la evidencia del informe.',
        cmd: 'ip address show\nip route show            # sin "default via"\nping 192.168.2.1         # otra red: no route',
        packets: [],
        status: 'fail',
      })
      return this
    }
    this.client.state = clientNext(this.client.state, 't1')
    this.push({
      title: 'Renovación a mitad del lease (T1 = 15 min)',
      text: 'A la mitad del lease el cliente renueva. Ahora ya tiene IP y sabe quién es el servidor: el Request va en unicast, de IP a IP. Si R1 no contestara, a los 7/8 del lease probaría en broadcast con cualquier servidor.',
      packets: [
        this.pkt(
          true,
          'REQUEST (unicast)',
          this.dhcpLayers({ type: 'DHCPREQUEST', fromClient: true, srcIp: ip, dstIp: c.gw, dstMac: c.serverMac, ciaddr: ip, options: [{ k: 'Estado', v: 'RENEWING' }] }),
        ),
      ],
    })
    this.client.state = clientNext(this.client.state, 'recv-ack')
    this.leases[0].expires = '30m'
    this.push({
      title: 'Ack de renovación',
      text: ipoe
        ? 'El lease se extiende. Lo que queda claro: la misma configuración que en la LAN es correcta, pero en el acceso le da dirección a cualquiera que llegue por la fibra. Le falta saber quién está entrando: esa es la otra mitad de P6 (PPPoE).'
        : 'El lease se extiende otros 30 minutos. Todo el trabajo estuvo del lado del servidor: el cliente sólo dijo "necesito una dirección". Por eso escala.',
      packets: [
        this.pkt(false, 'ACK (unicast)', this.dhcpLayers({ type: 'DHCPACK', fromClient: false, srcIp: c.gw, dstIp: ip, dstMac: c.clientMac, ciaddr: ip, yiaddr: ip, options: this.serverOptions(true) })),
      ],
      status: 'ok',
    })
    return this
  }
}
