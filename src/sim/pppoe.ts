// PPPoE de P6·B: concentrador en R1, abonado R2 sobre vlan-acceso (VID 100).
// Descubrimiento (PADI/PADO/PADR/PADS), LCP, auth por usuario/contraseña, IPCP y sesión.
import type { HeaderLayer, PacketAnim, Step, TableData, Topology } from './types'
import { intToIp, ipToInt } from './ip'
import { allocate } from './dhcp'
import { P6_R2_MAC, p6PppoeTopology } from '../data/topologies'

export const DISCOVERY = ['PADI', 'PADO', 'PADR', 'PADS'] as const

export const POOL_PPPOE = { name: 'pool-pppoe', start: '100.64.0.10', end: '100.64.0.100' }
export const POOL_IPOE = { name: 'pool-ipoe', start: '100.64.1.10', end: '100.64.1.100' }
export const LOCAL_ADDRESS = '100.64.0.1'
export const SERVICE_NAME = 'isp'
export const SESSION_ID = '0x0001'

export interface PppoeProfile {
  name: string
  localAddress: string
  pool: string
  rateLimit: string
}

export interface PppoeSecret {
  name: string
  password: string
  profile: string
  service: 'pppoe'
  disabled: boolean
}

export interface PppoeSession {
  name: string
  address: string
  caller: string
  service: string
  uptime: string
}

export const PROFILES: PppoeProfile[] = [
  { name: 'plan-10m', localAddress: LOCAL_ADDRESS, pool: 'pool-pppoe', rateLimit: '10M/10M' },
  { name: 'plan-50m', localAddress: LOCAL_ADDRESS, pool: 'pool-pppoe', rateLimit: '50M/50M' },
]

export const DEFAULT_SECRETS: PppoeSecret[] = [
  { name: 'abonado1', password: 'secreto1', profile: 'plan-10m', service: 'pppoe', disabled: false },
  { name: 'abonado2', password: 'secreto2', profile: 'plan-50m', service: 'pppoe', disabled: false },
]

/** 100.64.0.10–100 inclusive: 91 direcciones. La guía pregunta cuántos abonados caben a la vez. */
export function poolCount(start: string, end: string): number {
  return ipToInt(end) - ipToInt(start) + 1
}

/** Primera libre desde el principio del rango (pool PPP; no es dhcp-server). */
export function allocatePpp(pool: { start: string; end: string }, used: string[]): string | null {
  const taken = new Set(used)
  for (let n = ipToInt(pool.start); n <= ipToInt(pool.end); n++) {
    const ip = intToIp(n)
    if (!taken.has(ip)) return ip
  }
  return null
}

export function findSecret(secrets: PppoeSecret[], user: string, password: string): PppoeSecret | undefined {
  return secrets.find((s) => s.name === user && s.password === password)
}

/** El corte completo pide las dos cosas: secret deshabilitado y sesión activa removida. */
export function serviceCut(secretDisabled: boolean, sessionRemoved: boolean): { online: boolean; canReconnect: boolean } {
  return {
    online: !sessionRemoved,
    canReconnect: !secretDisabled,
  }
}

export type PppoeScenario = 'session' | 'vlan-mismatch' | 'cut-secret-only' | 'cut-then-ipoe' | 'change-plan'

const R1_MAC = '08:00:27:01:00:02'
const HOST_UNIQ = '0x39A1'

function profileOf(name: string): PppoeProfile {
  return PROFILES.find((p) => p.name === name)!
}

export class PppoeSim {
  steps: Step[] = []
  secrets: PppoeSecret[]
  sessions: PppoeSession[] = []
  queues: { name: string; target: string; limit: string; dynamic: boolean }[] = []
  client: { iface: string; ip?: string; gw?: string; user: string; password: string; vlan: number; pppoeEnabled: boolean }
  ipoeLease?: { address: string; mac: string; server: string; status: string }
  vlanR1 = 100
  private fid = 0
  private user: string
  private password: string

  constructor(scn: PppoeScenario) {
    this.secrets = DEFAULT_SECRETS.map((s) => ({ ...s }))
    this.user = 'abonado1'
    this.password = 'secreto1'
    this.client = {
      iface: 'vlan-acceso',
      user: this.user,
      password: this.password,
      vlan: scn === 'vlan-mismatch' ? 200 : 100,
      pppoeEnabled: true,
    }
  }

  topo(): Topology {
    return p6PppoeTopology({
      r2Ip: this.client.ip,
      r2Prefix: this.ipoeLease ? 24 : this.client.ip ? 32 : undefined,
      r2Iface: this.ipoeLease
        ? `vlan-acceso (ether2, VID ${this.client.vlan})`
        : this.client.ip
          ? 'wan-pppoe (vlan-acceso)'
          : `vlan-acceso (ether2, VID ${this.client.vlan})`,
      r1Ip: this.sessions[0] ? LOCAL_ADDRESS : this.ipoeLease ? '100.64.1.1' : undefined,
      r1Prefix: this.sessions[0] ? 32 : this.ipoeLease ? 24 : undefined,
      r1Iface: this.sessions[0] ? '<pppoe-abonado1> (vlan-acceso)' : 'vlan-acceso (ether2)',
      r2Vlan: this.client.vlan,
    })
  }

  tables(): TableData[] {
    const secret = this.secrets.find((s) => s.name === this.user)
    const prof = secret ? profileOf(secret.profile) : profileOf('plan-10m')
    return [
      {
        id: 'secrets',
        group: 'R1 (concentrador)',
        title: 'R1 · /ppp secret print',
        columns: ['NAME', 'SERVICE', 'PROFILE', 'DISABLED'],
        rows: this.secrets.map((s) => [s.name, s.service, s.profile, s.disabled ? 'yes' : 'no']),
      },
      {
        id: 'profiles',
        group: 'R1 (concentrador)',
        title: 'R1 · /ppp profile print',
        columns: ['NAME', 'LOCAL-ADDRESS', 'REMOTE-ADDRESS', 'RATE-LIMIT'],
        rows: PROFILES.map((p) => [p.name, p.localAddress, p.pool, p.rateLimit]),
      },
      {
        id: 'active',
        group: 'R1 (concentrador)',
        title: 'R1 · /ppp active print',
        columns: ['NAME', 'ADDRESS', 'CALLER', 'SERVICE', 'UPTIME'],
        rows: this.sessions.map((s) => [s.name, s.address, s.caller, s.service, s.uptime]),
        empty: 'sin sesiones',
      },
      {
        id: 'queue',
        group: 'R1 (concentrador)',
        title: 'R1 · /queue simple print',
        columns: ['NAME', 'TARGET', 'MAX-LIMIT', 'DYNAMIC'],
        rows: this.queues.map((q) => [q.name, q.target, q.limit, q.dynamic ? 'yes' : 'no']),
        empty: 'sin colas (el rate-limit del perfil las crea al conectar)',
      },
      {
        id: 'client',
        group: 'R2 (abonado)',
        title: 'R2 · wan-pppoe / dirección',
        columns: ['INTERFAZ', 'DIRECCIÓN', 'GATEWAY', 'VLAN'],
        rows: [
          [
            this.ipoeLease ? 'vlan-acceso (dhcp)' : this.client.pppoeEnabled ? 'wan-pppoe' : '—',
            this.client.ip ? `${this.client.ip}/${this.ipoeLease ? 24 : 32}` : '—',
            this.client.gw ?? '—',
            String(this.client.vlan),
          ],
        ],
      },
      ...(this.ipoeLease
        ? [
            {
              id: 'ipoe',
              group: 'R1 (concentrador)',
              title: 'R1 · /ip dhcp-server lease print',
              columns: ['ADDRESS', 'MAC-ADDRESS', 'SERVER', 'STATUS'],
              rows: [[this.ipoeLease.address, this.ipoeLease.mac, this.ipoeLease.server, this.ipoeLease.status]],
            },
          ]
        : []),
      {
        id: 'plan',
        group: 'R1 (concentrador)',
        title: 'R1 · plan del abonado1',
        columns: ['CAMPO', 'VALOR'],
        rows: [
          ['secret', `${this.user} · ${secret?.disabled ? 'disabled' : 'enabled'}`],
          ['profile', secret?.profile ?? '—'],
          ['rate-limit', prof.rateLimit],
          ['pool', `${POOL_PPPOE.name} ${POOL_PPPOE.start}-${POOL_PPPOE.end}`],
          ['service-name', SERVICE_NAME],
          ['vlan-acceso R1', `VID ${this.vlanR1}`],
        ],
      },
    ]
  }

  push(s: Omit<Step, 'tables' | 'topo'>) {
    this.steps.push({ ...s, tables: this.tables(), topo: this.topo() })
  }

  discLayers(code: string, fromClient: boolean, extra: { k: string; v: string; hl?: boolean }[]): HeaderLayer[] {
    const vid = fromClient ? this.client.vlan : this.vlanR1
    return [
      {
        title: 'Ethernet II',
        fields: [
          { k: 'MAC destino', v: code === 'PADI' ? 'FF:FF:FF:FF:FF:FF' : fromClient ? R1_MAC : P6_R2_MAC, hl: true },
          { k: 'MAC origen', v: fromClient ? P6_R2_MAC : R1_MAC },
          { k: '802.1Q VLAN', v: `VID ${vid}`, hl: true },
          { k: 'EtherType', v: '0x8863 · PPPoE Discovery' },
        ],
      },
      {
        title: 'PPPoE Discovery',
        fields: [
          { k: 'versión / tipo', v: '1 / 1' },
          { k: 'código', v: code, hl: true },
          { k: 'session-id', v: code === 'PADS' ? SESSION_ID : '0x0000', hl: code === 'PADS' },
          { k: 'Host-Uniq', v: HOST_UNIQ },
          ...extra,
        ],
      },
    ]
  }

  sessLayers(proto: string, fromClient: boolean, extra: { k: string; v: string; hl?: boolean }[]): HeaderLayer[] {
    return [
      {
        title: 'Ethernet II',
        fields: [
          { k: 'MAC destino', v: fromClient ? R1_MAC : P6_R2_MAC },
          { k: 'MAC origen', v: fromClient ? P6_R2_MAC : R1_MAC },
          { k: '802.1Q VLAN', v: `VID ${fromClient ? this.client.vlan : this.vlanR1}`, hl: true },
          { k: 'EtherType', v: '0x8864 · PPPoE Session' },
        ],
      },
      {
        title: 'PPPoE Session',
        fields: [
          { k: 'session-id', v: SESSION_ID, hl: true },
          { k: 'PPP protocolo', v: proto, hl: true },
          ...extra,
        ],
      },
    ]
  }

  pkt(fromClient: boolean, label: string, kind: 'pppoe' | 'ppp' | 'dhcp', layers: HeaderLayer[], lost = false): PacketAnim {
    return {
      fid: `p${++this.fid}`,
      from: fromClient ? 'R2' : 'R1',
      to: fromClient ? 'R1' : 'R2',
      segment: 'acceso',
      label,
      kind,
      layers,
      lost,
    }
  }

  cmdServer() {
    return `/ip pool add name=pool-pppoe ranges=100.64.0.10-100.64.0.100

/ppp profile add name=plan-10m \\
    local-address=100.64.0.1 \\
    remote-address=pool-pppoe \\
    rate-limit=10M/10M

/ppp profile add name=plan-50m \\
    local-address=100.64.0.1 \\
    remote-address=pool-pppoe \\
    rate-limit=50M/50M

/ppp secret add name=abonado1 password=secreto1 service=pppoe profile=plan-10m
/ppp secret add name=abonado2 password=secreto2 service=pppoe profile=plan-50m

/interface vlan add name=vlan-acceso interface=ether2 vlan-id=100

/interface pppoe-server server add service-name=isp interface=vlan-acceso disabled=no`
  }

  cmdClient(vlan = this.client.vlan) {
    return `/interface vlan add name=vlan-acceso interface=ether2 vlan-id=${vlan}

/interface pppoe-client add name=wan-pppoe \\
    interface=vlan-acceso \\
    user=abonado1 password=secreto1 \\
    add-default-route=yes \\
    disabled=no`
  }

  bringUp(opts: { announce?: boolean } = {}) {
    const secret = findSecret(this.secrets, this.user, this.password)
    if (!secret || secret.disabled) return false
    const prof = profileOf(secret.profile)
    const ip = allocatePpp(POOL_PPPOE, this.sessions.map((s) => s.address))!
    this.client.ip = ip
    this.client.gw = LOCAL_ADDRESS
    this.sessions = [
      { name: this.user, address: ip, caller: P6_R2_MAC, service: SERVICE_NAME, uptime: opts.announce ? '1s' : '12s' },
    ]
    this.queues = [{ name: `<pppoe-${this.user}>`, target: ip, limit: prof.rateLimit, dynamic: true }]
    return true
  }

  discovery(lost: boolean) {
    const padi = this.pkt(
      true,
      'PADI',
      'pppoe',
      this.discLayers('PADI', true, [
        { k: 'Service-Name', v: '(vacío: cualquier servicio)' },
        { k: 'destino', v: 'broadcast FF:FF:FF:FF:FF:FF', hl: true },
      ]),
      lost,
    )
    if (lost) {
      this.push({
        title: `PADI etiquetado con VID ${this.client.vlan}`,
        text: `R2 configuró vlan-id=${this.client.vlan} y R1 escucha en la 100. El PADI sale por el cable con esa etiqueta: para R1 es tráfico de otra red y lo descarta. Ningún log menciona la palabra «VLAN».`,
        cmd: this.cmdClient(),
        packets: [padi],
        status: 'fail',
        highlight: ['R2'],
      })
      this.push({
        title: 'Reintento… y nada',
        text: 'Las credenciales pueden estar bien y aun así no levanta. Primer lugar a mirar: /interface vlan print en las dos puntas. El concentrador no escucha en ether2: escucha en vlan-acceso.',
        cmd: '/interface vlan print',
        packets: [padi],
        status: 'fail',
        output: `# R2\n name=vlan-acceso vlan-id=${this.client.vlan} interface=ether2\n# R1\n name=vlan-acceso vlan-id=100 interface=ether2`,
      })
      return
    }
    this.push({
      title: 'PADI · ¿hay algún concentrador?',
      text: 'R2 no tiene IP ni sabe quién es el concentrador: el PADI sale en broadcast (MAC FF:FF:FF:FF:FF:FF), EtherType 0x8863, session-id 0x0000, etiquetado con la VLAN 100. Los switches del medio sólo ven tráfico de esa VLAN. No hay DHCP acá: esto es descubrimiento PPPoE.',
      cmd: this.cmdClient(),
      packets: [padi],
      highlight: ['R2'],
    })
    this.push({
      title: 'PADO · «soy isp»',
      text: `R1 recibe el PADI en vlan-acceso, donde escucha el pppoe-server con service-name=${SERVICE_NAME}. Contesta en unicast con PADO: AC-Name y Service-Name. Todavía no hay sesión ni dirección.`,
      packets: [
        this.pkt(
          false,
          'PADO',
          'pppoe',
          this.discLayers('PADO', false, [
            { k: 'AC-Name', v: SERVICE_NAME, hl: true },
            { k: 'Service-Name', v: SERVICE_NAME },
          ]),
        ),
      ],
      highlight: ['R1'],
    })
    this.push({
      title: 'PADR · R2 pide sesión a isp',
      text: 'El abonado elige ese concentrador y manda PADR en unicast, ya con Service-Name=isp. Si hubiera dos concentradores, el otro se queda afuera.',
      packets: [
        this.pkt(
          true,
          'PADR',
          'pppoe',
          this.discLayers('PADR', true, [{ k: 'Service-Name', v: SERVICE_NAME, hl: true }]),
        ),
      ],
      highlight: ['R2'],
    })
    this.push({
      title: `PADS · session-id ${SESSION_ID}`,
      text: 'R1 confirma y asigna un session-id. A partir de acá las tramas van con EtherType 0x8864 (sesión), no 0x8863. Todavía no hay dirección IP: falta negociar el enlace, autenticar y recién después IPCP.',
      packets: [
        this.pkt(
          false,
          'PADS',
          'pppoe',
          this.discLayers('PADS', false, [
            { k: 'Service-Name', v: SERVICE_NAME },
            { k: 'session-id', v: SESSION_ID, hl: true },
          ]),
        ),
      ],
      highlight: ['R1'],
    })
  }

  lcpAuthIpcp(opts: { failAuth?: boolean } = {}) {
    this.push({
      title: 'LCP · el enlace PPP',
      text: 'Adentro de la sesión, LCP (Link Control Protocol) acuerda los parámetros del enlace. La guía no nombra este paso: está acá porque sin enlace no hay autenticación ni IPCP. Todavía no hay dirección.',
      packets: [
        this.pkt(true, 'LCP Conf-Req', 'ppp', this.sessLayers('0xc021 · LCP', true, [{ k: 'código', v: 'Configure-Request' }])),
        this.pkt(false, 'LCP Conf-Ack', 'ppp', this.sessLayers('0xc021 · LCP', false, [{ k: 'código', v: 'Configure-Ack', hl: true }])),
      ],
    })
    const secret = findSecret(this.secrets, this.user, this.password)
    const authOk = !!secret && !secret.disabled && !opts.failAuth
    this.push({
      title: authOk ? 'Auth · usuario y contraseña' : 'Auth · las credenciales ya no valen',
      text: authOk
        ? `Antes de dar dirección, el concentrador pide quién sos. R2 manda user=${this.user} password=${this.password}. El /ppp secret es, en la práctica, el contrato: coincide con abonado1 y el perfil ${secret!.profile}. La guía no nombra PAP ni CHAP: nombra usuario, contraseña y el secret.`
        : `R2 redisca con user=${this.user} password=${this.password}. El secret está deshabilitado: el concentrador rechaza. La sesión no sube.`,
      cmd: authOk ? undefined : '/ppp secret disable [find name=abonado1]',
      packets: [
        this.pkt(
          true,
          `Auth ${this.user}`,
          'ppp',
          this.sessLayers('PPP Auth', true, [
            { k: 'usuario', v: this.user, hl: true },
            { k: 'contraseña', v: this.password },
          ]),
        ),
        this.pkt(
          false,
          authOk ? 'Auth OK' : 'Auth NAK',
          'ppp',
          this.sessLayers('PPP Auth', false, [{ k: 'resultado', v: authOk ? 'aceptado' : 'rechazado (secret disabled)', hl: true }]),
        ),
      ],
      status: authOk ? undefined : 'fail',
      highlight: ['R1'],
    })
    if (!authOk) return false
    const ip = allocatePpp(POOL_PPPOE, this.sessions.map((s) => s.address))!
    this.push({
      title: `IPCP · la dirección la da PPP, no DHCP`,
      text: `Recién ahora se negocia la IP. IPCP (IP Control Protocol) pide una dirección y R1 la saca de pool-pppoe (${POOL_PPPOE.start}–${POOL_PPPOE.end}), no de un dhcp-server. local-address=${LOCAL_ADDRESS} queda del lado de R1 adentro de esta sesión. No hay Discover, no hay lease.`,
      packets: [
        this.pkt(true, 'IPCP Req', 'ppp', this.sessLayers('0x8021 · IPCP', true, [{ k: 'IP Address', v: '0.0.0.0 (pedir)' }])),
        this.pkt(
          false,
          `IPCP ${ip}`,
          'ppp',
          this.sessLayers('0x8021 · IPCP', false, [
            { k: 'IP Address', v: ip, hl: true },
            { k: 'peer (R1)', v: LOCAL_ADDRESS },
          ]),
        ),
      ],
    })
    this.client.ip = ip
    this.client.gw = LOCAL_ADDRESS
    const prof = profileOf(secret!.profile)
    this.sessions = [{ name: this.user, address: ip, caller: P6_R2_MAC, service: SERVICE_NAME, uptime: '1s' }]
    this.queues = [{ name: `<pppoe-${this.user}>`, target: ip, limit: prof.rateLimit, dynamic: true }]
    this.push({
      title: 'Sesión establecida · la cola apareció sola',
      text: `Nadie escribió una regla de QoS: la creó el rate-limit del perfil ${prof.name} (${prof.rateLimit}) al conectar. En R2, /ip address print muestra ${ip} del pool 100.64.0.x. Ese es el plan comercial, materializado.`,
      cmd: '/ppp active print\n/ip address print\n/queue simple print',
      packets: [],
      status: 'ok',
      highlight: ['R1', 'R2'],
      output: `Flags: R - RADIUS\n # NAME      SERVICE CALLER           ADDRESS         UPTIME\n 0 ${this.user.padEnd(9)} pppoe   ${P6_R2_MAC}  ${ip.padEnd(14)} 00:00:01\n\n/queue simple print\n 0  name="<pppoe-${this.user}>" target=${ip}/32 max-limit=${prof.rateLimit} dynamic=yes`,
    })
    return true
  }

  run(scn: PppoeScenario) {
    this.push({
      title: 'Pool, planes y secrets en R1',
      text: 'Dos perfiles, que son los planes comerciales: 10M y 50M simétricos. El plan es propiedad del perfil, no del abonado: con 5.000 clientes en tres planes, cambiar una velocidad es tocar un objeto. pool-pppoe no es un pool DHCP aunque se cree con el mismo comando: lo consume PPP.',
      cmd: this.cmdServer(),
      packets: [],
      status: 'info',
      highlight: ['R1'],
    })
    if (scn === 'vlan-mismatch') {
      this.discovery(true)
      return this
    }
    this.discovery(false)
    if (!this.lcpAuthIpcp()) return this

    if (scn === 'change-plan') {
      const s = this.secrets.find((x) => x.name === this.user)!
      s.profile = 'plan-50m'
      this.push({
        title: 'Cambio de plan: el perfil, no el abonado',
        text: 'Se cambia el profile de abonado1 a plan-50m. La sesión vieja sigue con la cola de 10M: el rate-limit se materializa al conectar. Hay que cortar y dejar que reconecte.',
        cmd: '/ppp secret set [find name=abonado1] profile=plan-50m\n/ppp active remove [find name=abonado1]',
        packets: [],
        status: 'info',
      })
      this.sessions = []
      this.queues = []
      this.client.ip = undefined
      this.client.gw = undefined
      this.push({
        title: 'Sesión cortada · reconecta con plan-50m',
        text: 'R2 redisca. Misma autenticación, otro perfil: la cola vuelve con 50M/50M. Eso es, en chico, el cambio de plan de un ISP.',
        cmd: this.cmdClient(),
        packets: [],
      })
      this.discovery(false)
      this.lcpAuthIpcp()
      return this
    }

    if (scn === 'cut-secret-only') {
      const s = this.secrets.find((x) => x.name === this.user)!
      s.disabled = true
      const cut = serviceCut(true, false)
      this.push({
        title: 'Sólo el secret: la sesión vieja sigue viva',
        text: `Deshabilitar el contrato no desconecta a nadie. /ppp active print sigue mostrando a ${this.user} con ${this.client.ip}: el abonado sigue navegando. online=${cut.online}.`,
        cmd: '/ppp secret disable [find name=abonado1]',
        packets: [],
        status: 'fail',
        highlight: ['R1'],
        output: `/ppp secret print\nFlags: X - disabled\n 0 X name="abonado1" service=pppoe profile=plan-10m\n\n/ppp active print\n 0 ${this.user}  pppoe  ${this.client.ip}  (sigue)`,
      })
      this.sessions = []
      this.queues = []
      this.client.ip = undefined
      this.client.gw = undefined
      this.push({
        title: 'Secret + sesión: se cae y no puede volver',
        text: 'Ahora sí: /ppp active remove tira la sesión. Al rediscar, el concentrador pide credenciales y las suyas ya no valen. Esto es lo que el IPoE de la primera mitad no puede hacer: allá el que reparte no sabe quién es, sabe una MAC, y una MAC se cambia.',
        cmd: '/ppp secret disable [find name=abonado1]\n/ppp active remove [find name=abonado1]',
        packets: [],
        status: 'ok',
      })
      this.discovery(false)
      this.lcpAuthIpcp({ failAuth: true })
      return this
    }

    if (scn === 'cut-then-ipoe') {
      const s = this.secrets.find((x) => x.name === this.user)!
      s.disabled = true
      this.sessions = []
      this.queues = []
      this.client.ip = undefined
      this.client.gw = undefined
      this.client.pppoeEnabled = false
      this.push({
        title: 'Corte completo… y el IPoE de la otra mitad',
        text: 'Secret deshabilitado y sesión removida: PPPoE no reconecta. Si en la primera mitad quedó levantado dhcp-acceso sobre la misma vlan-acceso, el abonado todavía tiene otra puerta.',
        cmd: '/ppp secret disable [find name=abonado1]\n/ppp active remove [find name=abonado1]\n\n/interface pppoe-client disable [find name=wan-pppoe]\n\n/ip dhcp-client add interface=vlan-acceso add-default-route=yes disabled=no',
        packets: [],
        status: 'info',
      })
      const ipoeIp = allocate(POOL_IPOE, [], P6_R2_MAC)!
      this.push({
        title: 'D · Discover por vlan-acceso (IPoE)',
        text: 'R2 pide DHCP sobre la misma VLAN. No entrega usuario ni contraseña. El servidor de IPoE de la primera mitad contesta igual.',
        packets: [
          this.pkt(true, 'DISCOVER', 'dhcp', [
            {
              title: 'Ethernet II',
              fields: [
                { k: 'MAC destino', v: 'FF:FF:FF:FF:FF:FF', hl: true },
                { k: 'MAC origen', v: P6_R2_MAC },
                { k: '802.1Q VLAN', v: 'VID 100', hl: true },
                { k: 'EtherType', v: '0x0800 · IPv4' },
              ],
            },
            {
              title: 'IPv4 / UDP',
              fields: [
                { k: 'IP origen', v: '0.0.0.0' },
                { k: 'IP destino', v: '255.255.255.255' },
                { k: 'UDP', v: '68 → 67' },
              ],
            },
            { title: 'DHCP', fields: [{ k: 'Opción 53', v: 'DHCPDISCOVER', hl: true }] },
          ]),
        ],
      })
      this.client.ip = ipoeIp
      this.client.gw = '100.64.1.1'
      this.ipoeLease = { address: ipoeIp, mac: P6_R2_MAC, server: 'dhcp-acceso', status: 'bound' }
      this.push({
        title: `Entra igual · ${ipoeIp} por IPoE`,
        text: 'Recibe 100.64.1.x y ruta por defecto, con el /ppp secret deshabilitado, mientras /ppp active print queda vacío. El corte que acabás de hacer no sirvió de nada — no por un error de configuración, sino porque al lado hay algo que reparte sin preguntar. Un ISP que ofrece las dos cosas tiene que cortar en las dos.',
        cmd: '/ip dhcp-server lease print\n/ppp active print',
        packets: [
          this.pkt(false, `ACK ${ipoeIp}`, 'dhcp', [
            {
              title: 'Ethernet II',
              fields: [
                { k: 'MAC destino', v: P6_R2_MAC },
                { k: 'MAC origen', v: R1_MAC },
                { k: '802.1Q VLAN', v: 'VID 100' },
                { k: 'EtherType', v: '0x0800 · IPv4' },
              ],
            },
            { title: 'DHCP', fields: [{ k: 'Opción 53', v: 'DHCPACK', hl: true }, { k: 'yiaddr', v: ipoeIp, hl: true }] },
          ]),
        ],
        status: 'fail',
        highlight: ['R2'],
        output: `/ppp active print\n(sin sesiones)\n\n/ip dhcp-server lease print\nFlags: D - DYNAMIC\n  ADDRESS         MAC-ADDRESS        SERVER        STATUS\nD ${ipoeIp.padEnd(15)} ${P6_R2_MAC}  dhcp-acceso   bound`,
      })
      return this
    }

    return this
  }
}
