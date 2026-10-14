import { describe, expect, it } from 'vitest'
import { inCidr, networkOf } from './ip'
import { buildTable, lookup } from './routing'
import { initialState, simulateArping, simulatePing } from './net'
import { p1Topology, p2Topology, p3Topology, backboneOnly, clientDefaults, p6Topology, P1_CLIENT_MAC, P1_ROUTER_MAC } from '../data/topologies'
import { p2Presets, p3Presets } from '../data/staticRoutes'
import { OspfSim, defaultOspfRouters, electDrBdr, finalState } from './ospf'
import { BgpSim, sessionCanEstablish } from './bgp'
import { DhcpSim, allocate, clientNext, DORA } from './dhcp'
import { PppoeSim, allocatePpp, DISCOVERY, POOL_PPPOE, findSecret, poolCount, serviceCut, DEFAULT_SECRETS } from './pppoe'
import type { Device } from './types'

const preset = (list: typeof p2Presets, id: string) => list.find((p) => p.id === id)!.routes

describe('IP y tabla de ruteo', () => {
  it('calcula redes y pertenencia', () => {
    expect(networkOf('192.168.3.10', 24)).toBe('192.168.3.0/24')
    expect(inCidr('10.10.11.3', '10.10.11.0/24')).toBe(true)
    expect(inCidr('10.10.12.3', '10.10.11.0/24')).toBe(false)
    expect(inCidr('8.8.8.8', '0.0.0.0/0')).toBe(true)
  })

  it('longest prefix match: la /24 le gana a la default', () => {
    const r2 = p2Topology.devices.find((d) => d.id === 'R2') as Device
    const table = buildTable(r2, [
      { dst: '0.0.0.0/0', gateway: '10.10.10.1', proto: 'static', distance: 1 },
      { dst: '192.168.4.0/24', gateway: '10.10.11.3', proto: 'static', distance: 1 },
    ])
    expect(lookup(table, '192.168.4.10')?.gateway).toBe('10.10.11.3')
    expect(lookup(table, '192.168.1.10')?.gateway).toBe('10.10.10.1')
    expect(lookup(table, '10.10.11.3')?.proto).toBe('connected')
  })

  it('gateway fuera de las redes conectadas queda inactivo (P3: 192.168.4.1 no sirve)', () => {
    const r1 = p3Topology.devices.find((d) => d.id === 'R1') as Device
    const table = buildTable(r1, [{ dst: '192.168.4.0/24', gateway: '192.168.4.1', proto: 'static', distance: 1 }])
    const r = table.find((x) => x.dst === '192.168.4.0/24')!
    expect(r.active).toBe(false)
    expect(lookup(table, '192.168.4.1')).toBeUndefined()
  })

  it('a igual destino gana la menor distance (eBGP 20 sobre OSPF 110)', () => {
    const r1 = p3Topology.devices.find((d) => d.id === 'R1') as Device
    const table = buildTable(r1, [
      { dst: '192.168.3.0/24', gateway: '10.10.10.3', proto: 'ospf', distance: 110 },
      { dst: '192.168.3.0/24', gateway: '10.10.10.3', proto: 'bgp', distance: 20 },
    ])
    expect(lookup(table, '192.168.3.1')?.proto).toBe('bgp')
  })
})

describe('P1 · ARP', () => {
  it('el primer ping dispara ARP y llena las dos tablas', () => {
    const st = initialState(p1Topology)
    const res = simulatePing(p1Topology, st, { from: 'cliente', to: '192.168.1.1', count: 2 })
    expect(res.ok).toBe(true)
    expect(res.arpRequests).toBe(1)
    expect(res.state.arp.cliente).toEqual([{ ip: '192.168.1.1', mac: P1_ROUTER_MAC, iface: 'ether2' }])
    expect(res.state.arp.router).toEqual([{ ip: '192.168.1.10', mac: P1_CLIENT_MAC, iface: 'ether2' }])
    // orden: ARP request, ARP reply, ICMP request, ICMP reply
    const kinds = res.steps.flatMap((s) => s.packets.map((p) => p.kind))
    expect(kinds.slice(0, 4)).toEqual(['arp-req', 'arp-rep', 'icmp-req', 'icmp-rep'])
  })

  it('con la caché llena no hay ARP; arping siempre pregunta', () => {
    const first = simulatePing(p1Topology, initialState(p1Topology), { from: 'cliente', to: '192.168.1.1' })
    const second = simulatePing(p1Topology, first.state, { from: 'cliente', to: '192.168.1.1' })
    expect(second.arpRequests).toBe(0)
    const ar = simulateArping(p1Topology, first.state, 'cliente', 'ether2', '192.168.1.1')
    expect(ar.steps[0].packets[0].kind).toBe('arp-req')
  })
})

describe('P2 · cadena con rutas estáticas', () => {
  it('sin ruta de retorno el ping falla en la vuelta', () => {
    const st = initialState(p2Topology, { ...preset(p2Presets, 'ida'), ...clientDefaults })
    const res = simulatePing(p2Topology, st, { from: 'C1', to: '192.168.4.10' })
    expect(res.ok).toBe(false)
    const fail = res.steps.find((s) => s.status === 'fail')!
    expect(fail.title).toContain('R4 no tiene ruta')
  })

  it('con las rutas completas: 5 líneas de traceroute de cliente a cliente, TTL baja por salto y la IP no cambia', () => {
    const st = initialState(p2Topology, { ...preset(p2Presets, 'full'), ...clientDefaults })
    const res = simulatePing(p2Topology, st, { from: 'C1', to: '192.168.4.10' })
    expect(res.ok).toBe(true)
    expect(res.hops).toEqual(['192.168.1.1', '10.10.10.2', '10.10.11.3', '10.10.12.4', '192.168.4.10'])
    const icmp = res.steps.flatMap((s) => s.packets).filter((p) => p.kind === 'icmp-req')
    const ttls = icmp.map((p) => p.layers[1].fields.find((f) => f.k === 'TTL')!.v)
    expect(ttls).toEqual(['64', '63', '62', '61', '60'])
    expect(new Set(icmp.map((p) => p.frame!.dstIp))).toEqual(new Set(['192.168.4.10']))
    expect(new Set(icmp.map((p) => p.frame!.srcMac)).size).toBe(5)
  })

  it('a 192.168.4.1 da una línea menos', () => {
    const st = initialState(p2Topology, { ...preset(p2Presets, 'full'), ...clientDefaults })
    expect(simulatePing(p2Topology, st, { from: 'C1', to: '192.168.4.1' }).hops).toHaveLength(4)
  })

  it('si se apaga R3, la LAN 4 queda inalcanzable', () => {
    const st = initialState(p2Topology, { ...preset(p2Presets, 'full'), ...clientDefaults }, ['R3'])
    expect(simulatePing(p2Topology, st, { from: 'C1', to: '192.168.4.10' }).ok).toBe(false)
  })
})

describe('P3 · backbone', () => {
  it('12 rutas estáticas y 3 líneas de traceroute de cliente a cliente', () => {
    const routes = preset(p3Presets, 'full')
    expect(Object.values(routes).flat()).toHaveLength(12)
    const st = initialState(p3Topology, { ...routes, ...clientDefaults })
    const res = simulatePing(p3Topology, st, { from: 'C1', to: '192.168.4.10' })
    expect(res.ok).toBe(true)
    expect(res.hops).toEqual(['192.168.1.1', '10.10.10.4', '192.168.4.10'])
  })
})

describe('P4 · OSPF', () => {
  it('elige DR = R4 y BDR = R3 por router-id', () => {
    const e = electDrBdr(defaultOspfRouters())
    expect(e).toEqual({ dr: 'R4', bdr: 'R3' })
    expect(finalState('R1', 'R2', e)).toBe('2-Way')
    expect(finalState('R1', 'R4', e)).toBe('Full')
  })

  it('la elección no es preemptiva y el BDR asciende si cae el DR', () => {
    const rs = defaultOspfRouters()
    const sinR4 = electDrBdr(rs.filter((r) => r.id !== 'R4'), { dr: 'R4', bdr: 'R3' })
    expect(sinR4).toEqual({ dr: 'R3', bdr: 'R2' })
    expect(electDrBdr(rs, sinR4)).toEqual({ dr: 'R3', bdr: 'R2' })
  })

  it('converge: cada router aprende las 3 LAN remotas y el ping pasa', () => {
    const sim = new OspfSim(backboneOnly(), defaultOspfRouters()).converge()
    for (const id of ['R1', 'R2', 'R3', 'R4']) {
      expect(sim.st.sim.routes[id].filter((r) => r.proto === 'ospf')).toHaveLength(3)
    }
    expect(sim.st.neighbors.R1.map((n) => n.state).sort()).toEqual(['2-Way', 'Full', 'Full'])
    expect(sim.steps[sim.steps.length - 1].status).toBe('ok')
  })

  it('al caer R3 desaparece 192.168.3.0/24 y vuelve sola', () => {
    const sim = new OspfSim(backboneOnly(), defaultOspfRouters()).convergeSilently()
    sim.failRouter('R3', 'R1')
    const idxDown = sim.steps.findIndex((s) => s.title.startsWith('SPF otra vez'))
    const rowsDown = sim.steps[idxDown].tables.find((t) => t.id === 'rt-R1')!.rows.map((r) => r[1])
    expect(rowsDown).not.toContain('192.168.3.0/24')
    const rowsBack = sim.steps[sim.steps.length - 1].tables.find((t) => t.id === 'rt-R1')!.rows.map((r) => r[1])
    expect(rowsBack).toContain('192.168.3.0/24')
    expect(sim.st.election).toEqual({ dr: 'R4', bdr: 'R2' })
  })
})

describe('P5 · BGP', () => {
  it('la sesión sube sólo con las dos puntas y los AS cruzados', () => {
    expect(sessionCanEstablish({ as: 65001, remoteAs: 65003 }, { as: 65003, remoteAs: 65001 })).toBe(true)
    expect(sessionCanEstablish({ as: 65001, remoteAs: 65003 }, { as: 65003 })).toBe(false)
    expect(sessionCanEstablish({ as: 65001, remoteAs: 65002 }, { as: 65003, remoteAs: 65001 })).toBe(false)
  })

  it('R1 aprende 192.168.3.0/24 por BGP con gateway 10.10.10.3', () => {
    const sim = new BgpSim(backboneOnly()).run()
    const r = sim.sim.routes.R1.find((x) => x.dst === '192.168.3.0/24')!
    expect(r).toMatchObject({ proto: 'bgp', gateway: '10.10.10.3', distance: 20, active: true })
    expect(sim.sessions.R1[0].state).toBe('established')
  })

  it('con OSPF vivo, gana eBGP y OSPF queda de respaldo', () => {
    const sim = new BgpSim(backboneOnly(), { withOspf: true }).run()
    const both = sim.sim.routes.R1.filter((x) => x.dst === '192.168.3.0/24')
    expect(both.find((x) => x.proto === 'bgp')!.active).toBe(true)
    expect(both.find((x) => x.proto === 'ospf')!.active).toBe(false)
  })

  it('AS_PATH de la pregunta 4: 65003 65002', () => {
    const sim = new BgpSim(backboneOnly(), { r2WithR3: true }).run()
    expect(sim.sim.routes.R1.find((x) => x.dst === '192.168.2.0/24')!.comment).toBe('AS_PATH 65003 65002')
  })
})

describe('P6 · DHCP', () => {
  const macs = { c1: '08:00:27:C1:00:02', r2: '08:00:27:A2:00:02', r1lan: '08:00:27:01:00:03', r1acc: '08:00:27:01:00:02' }

  it('asigna dentro del pool y respeta el lease existente', () => {
    const pool = { name: 'pool-dhcp', start: '192.168.1.100', end: '192.168.1.200' }
    const a = allocate(pool, [], 'aa')!
    expect(inCidr(a, '192.168.1.0/24')).toBe(true)
    const n = Number(a.split('.')[3])
    expect(n).toBeGreaterThanOrEqual(100)
    expect(n).toBeLessThanOrEqual(200)
    const leases = [{ address: a, mac: 'aa', server: 'dhcp-lan1', status: 'bound' as const, expires: '' }]
    expect(allocate(pool, leases, 'aa')).toBe(a)
    expect(allocate(pool, leases, 'bb')).not.toBe(a)
    expect(allocate({ name: 'x', start: '10.0.0.1', end: '10.0.0.1' }, [{ ...leases[0], address: '10.0.0.1' }], 'cc')).toBeNull()
  })

  it('máquina de estados DORA', () => {
    let s = clientNext('INIT', 'send-discover')
    expect(s).toBe('SELECTING')
    s = clientNext(s, 'recv-offer')
    expect(s).toBe('REQUESTING')
    s = clientNext(s, 'recv-ack')
    expect(s).toBe('BOUND')
    expect(clientNext('REQUESTING', 'recv-nak')).toBe('INIT')
    expect(clientNext('BOUND', 't1')).toBe('RENEWING')
  })

  it('la simulación manda Discover, Offer, Request, Ack en ese orden y deja el lease bound', () => {
    const sim = new DhcpSim('lan', p6Topology, macs).run('lan')
    const types = sim.steps.flatMap((s) => s.packets.map((p) => p.layers[2].fields.find((f) => f.k === 'Opción 53')!.v))
    expect(types.slice(0, 4)).toEqual([...DORA])
    expect(sim.leases[0]).toMatchObject({ status: 'bound', mac: macs.c1 })
    expect(sim.client.gw).toBe('192.168.1.1')
  })

  it('sin el objeto network: IP sí, gateway no', () => {
    const sim = new DhcpSim('lan-no-network', p6Topology, macs).run('lan-no-network')
    expect(sim.client.state).toBe('BOUND')
    expect(sim.client.gw).toBeUndefined()
  })

  it('IPoE entrega 100.64.1.x y con VLAN distinta no recibe nada', () => {
    const ok = new DhcpSim('ipoe', p6Topology, macs).run('ipoe')
    expect(inCidr(ok.client.ip!, '100.64.1.0/24')).toBe(true)
    const bad = new DhcpSim('ipoe-vlan-mismatch', p6Topology, macs).run('ipoe-vlan-mismatch')
    expect(bad.leases).toHaveLength(0)
    expect(bad.client.ip).toBeUndefined()
  })
})

describe('P6 · PPPoE', () => {
  it('el pool 100.64.0.10–100 tiene 91 direcciones y asigna desde el principio', () => {
    expect(poolCount(POOL_PPPOE.start, POOL_PPPOE.end)).toBe(91)
    expect(allocatePpp(POOL_PPPOE, [])).toBe('100.64.0.10')
    expect(allocatePpp(POOL_PPPOE, ['100.64.0.10'])).toBe('100.64.0.11')
    expect(allocatePpp({ start: '10.0.0.1', end: '10.0.0.1' }, ['10.0.0.1'])).toBeNull()
  })

  it('el secret es el contrato: usuario/contraseña y disabled', () => {
    expect(findSecret(DEFAULT_SECRETS, 'abonado1', 'secreto1')?.profile).toBe('plan-10m')
    expect(findSecret(DEFAULT_SECRETS, 'abonado2', 'secreto2')?.profile).toBe('plan-50m')
    expect(findSecret(DEFAULT_SECRETS, 'abonado1', 'otra')).toBeUndefined()
    expect(serviceCut(true, false)).toEqual({ online: true, canReconnect: false })
    expect(serviceCut(true, true)).toEqual({ online: false, canReconnect: false })
  })

  it('descubrimiento PADI/PADO/PADR/PADS, después LCP, auth e IPCP; la IP sale del pool PPP', () => {
    const sim = new PppoeSim('session').run('session')
    const codes = sim.steps.flatMap((s) => s.packets.filter((p) => p.kind === 'pppoe').map((p) => p.layers[1].fields.find((f) => f.k === 'código')!.v))
    expect(codes.slice(0, 4)).toEqual([...DISCOVERY])
    expect(sim.sessions[0]).toMatchObject({ name: 'abonado1', service: 'isp' })
    expect(sim.client.ip).toBe('100.64.0.10')
    expect(sim.queues[0]).toMatchObject({ name: '<pppoe-abonado1>', limit: '10M/10M', dynamic: true })
    const protos = sim.steps.flatMap((s) => s.packets.filter((p) => p.kind === 'ppp').map((p) => p.layers[1].fields.find((f) => f.k === 'PPP protocolo')!.v))
    expect(protos.some((p) => p.includes('LCP'))).toBe(true)
    expect(protos.some((p) => p.includes('IPCP'))).toBe(true)
  })

  it('VLAN distinta: el PADI se pierde y no hay sesión', () => {
    const sim = new PppoeSim('vlan-mismatch').run('vlan-mismatch')
    expect(sim.sessions).toHaveLength(0)
    expect(sim.client.ip).toBeUndefined()
    expect(sim.steps.some((s) => s.packets.some((p) => p.lost))).toBe(true)
  })

  it('sólo deshabilitar el secret deja la sesión viva; con remove ya no reconecta', () => {
    const sim = new PppoeSim('cut-secret-only').run('cut-secret-only')
    const onlySecret = sim.steps.find((s) => s.title.startsWith('Sólo el secret'))!
    expect(onlySecret.tables.find((t) => t.id === 'active')!.rows.length).toBe(1)
    expect(sim.sessions).toHaveLength(0)
    expect(sim.secrets.find((s) => s.name === 'abonado1')!.disabled).toBe(true)
    expect(sim.steps.some((s) => s.title.startsWith('Auth · las credenciales'))).toBe(true)
  })

  it('con IPoE en la misma VLAN, el corte PPPoE no impide entrar por DHCP', () => {
    const sim = new PppoeSim('cut-then-ipoe').run('cut-then-ipoe')
    expect(sim.sessions).toHaveLength(0)
    expect(sim.ipoeLease?.server).toBe('dhcp-acceso')
    expect(sim.client.ip?.startsWith('100.64.1.')).toBe(true)
  })

  it('cambiar el perfil y reconectar materializa la cola nueva', () => {
    const sim = new PppoeSim('change-plan').run('change-plan')
    expect(sim.secrets.find((s) => s.name === 'abonado1')!.profile).toBe('plan-50m')
    expect(sim.queues[0].limit).toBe('50M/50M')
    expect(sim.sessions[0].name).toBe('abonado1')
  })
})
