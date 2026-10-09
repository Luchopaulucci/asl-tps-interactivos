// Tabla de ruteo: rutas conectadas, resolución de gateway, selección por distance
// y búsqueda por prefijo más largo (longest prefix match).
import type { Device, Route } from './types'
import { inCidr, networkOf, prefixLen } from './ip'

/** Distancias administrativas por defecto de RouterOS 7 */
export const DISTANCE = { connected: 0, static: 1, bgp: 20, ospf: 110, dhcp: 1 } as const

export function connectedRoutes(dev: Device): Route[] {
  return dev.ifaces
    .filter((i) => i.ip && i.prefix !== undefined)
    .map((i) => ({
      dst: networkOf(i.ip!, i.prefix!),
      iface: i.name,
      proto: 'connected' as const,
      distance: 0,
      active: true,
    }))
}

/**
 * Completa la tabla de un router: agrega las conectadas, resuelve por qué interfaz sale
 * cada gateway (tiene que estar en una red conectada) y marca activa sólo la de menor
 * distance para cada destino, como hace RouterOS.
 */
export function buildTable(dev: Device, extra: Route[]): Route[] {
  const conn = connectedRoutes(dev)
  const resolved = extra.map((r) => {
    if (!r.gateway) return { ...r, active: r.active ?? true }
    const via = conn.find((c) => inCidr(r.gateway!, c.dst))
    if (!via) {
      return { ...r, iface: undefined, active: false, note: 'gateway inalcanzable: no está en ninguna red conectada' }
    }
    return { ...r, iface: via.iface, active: r.active ?? true }
  })
  const all = [...conn, ...resolved]
  // Por cada destino, sólo una activa: la de menor distance.
  const byDst = new Map<string, Route[]>()
  for (const r of all) {
    if (!byDst.has(r.dst)) byDst.set(r.dst, [])
    byDst.get(r.dst)!.push(r)
  }
  for (const list of byDst.values()) {
    const candidates = list.filter((r) => r.active !== false)
    candidates.sort((a, b) => a.distance - b.distance)
    candidates.forEach((r, i) => {
      if (i > 0) {
        r.active = false
        r.note = r.note ?? `respaldo: pierde por distance (${r.distance} > ${candidates[0].distance})`
      }
    })
  }
  return all.sort((a, b) => prefixLen(b.dst) - prefixLen(a.dst) || a.dst.localeCompare(b.dst, 'en', { numeric: true }))
}

/** Longest prefix match entre las rutas activas. */
export function lookup(routes: Route[], ip: string): Route | undefined {
  let best: Route | undefined
  for (const r of routes) {
    if (r.active === false || !inCidr(ip, r.dst)) continue
    if (!best) {
      best = r
      continue
    }
    const pb = prefixLen(best.dst)
    const pr = prefixLen(r.dst)
    if (pr > pb || (pr === pb && r.distance < best.distance)) best = r
  }
  return best
}

/** Flags al estilo de /ip route print: D dinámica, A activa, c/s/o/b protocolo */
export function routeFlags(r: Route): string {
  const p = { connected: 'c', static: 's', ospf: 'o', bgp: 'b', dhcp: 'd' }[r.proto]
  const dyn = r.proto === 'static' ? '' : 'D'
  return `${dyn}${r.active === false ? '' : 'A'}${p}`
}
