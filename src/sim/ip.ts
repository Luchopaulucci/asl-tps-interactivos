// Utilidades de direcciones IPv4.

export function ipToInt(ip: string): number {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    throw new Error(`IP inválida: ${ip}`)
  }
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0
}

export function intToIp(n: number): string {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

export function maskOf(prefix: number): number {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
}

export function parseCidr(cidr: string): { net: number; prefix: number } {
  const [ip, p] = cidr.split('/')
  const prefix = p === undefined ? 32 : Number(p)
  return { net: (ipToInt(ip) & maskOf(prefix)) >>> 0, prefix }
}

export function networkOf(ip: string, prefix: number): string {
  return `${intToIp((ipToInt(ip) & maskOf(prefix)) >>> 0)}/${prefix}`
}

export function inCidr(ip: string, cidr: string): boolean {
  const { net, prefix } = parseCidr(cidr)
  return ((ipToInt(ip) & maskOf(prefix)) >>> 0) === net
}

export function prefixLen(cidr: string): number {
  return parseCidr(cidr).prefix
}
