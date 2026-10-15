import type { Device, PacketAnim, PacketKind, Topology } from '../sim/types'

type Pt = { x: number; y: number }

export const KIND_COLOR: Record<PacketKind, string> = {
  'arp-req': '#d97706',
  'arp-rep': '#ea580c',
  'icmp-req': '#2563eb',
  'icmp-rep': '#16a34a',
  ospf: '#7c3aed',
  bgp: '#db2777',
  tcp: '#64748b',
  dhcp: '#0891b2',
  pppoe: '#c2410c',
  ppp: '#7e22ce',
  error: '#dc2626',
}

function attached(topo: Topology, segId: string): Device[] {
  return topo.devices.filter((d) => d.ifaces.some((i) => i.segment === segId))
}

function attachPoint(topo: Topology, d: Device, segId: string): Pt {
  const seg = topo.segments.find((s) => s.id === segId)!
  if (seg.kind === 'bus') return { x: d.x, y: seg.y! }
  return { x: d.x, y: d.y }
}

export function packetPath(topo: Topology, p: PacketAnim): Pt[] {
  const a = topo.devices.find((d) => d.id === p.from)!
  const b = topo.devices.find((d) => d.id === p.to)!
  const seg = topo.segments.find((s) => s.id === p.segment)!
  if (seg.kind === 'bus') {
    return [
      { x: a.x, y: a.y },
      { x: a.x, y: seg.y! },
      { x: b.x, y: seg.y! },
      { x: b.x, y: b.y },
    ]
  }
  return [
    { x: a.x, y: a.y },
    { x: b.x, y: b.y },
  ]
}

function pointAt(pts: Pt[], t: number): Pt {
  const lens = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y))
  const total = lens.reduce((a, b) => a + b, 0) || 1
  let d = Math.min(1, Math.max(0, t)) * total
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const f = lens[i] ? Math.min(1, d / lens[i]) : 0
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f }
    }
    d -= lens[i]
  }
  return pts[pts.length - 1]
}

function RouterIcon({ d, color }: { d: Device; color: string }) {
  return (
    <g>
      <circle cx={d.x} cy={d.y} r={28} fill={color} />
      <g stroke="white" strokeWidth={3} strokeLinecap="round" fill="none">
        <path d={`M${d.x - 13} ${d.y - 6} h22 m-6 -6 l6 6 l-6 6`} />
        <path d={`M${d.x + 13} ${d.y + 7} h-22 m6 -6 l-6 6 l6 6`} />
      </g>
    </g>
  )
}

function HostIcon({ d, color }: { d: Device; color: string }) {
  return (
    <g>
      <rect x={d.x - 30} y={d.y - 24} width={60} height={40} rx={6} fill={color} />
      <rect x={d.x - 24} y={d.y - 18} width={48} height={28} rx={3} fill="white" opacity={0.85} />
      <rect x={d.x - 14} y={d.y + 18} width={28} height={6} rx={2} fill={color} />
    </g>
  )
}

export default function TopologyView({
  topo,
  packets,
  t,
  highlight = [],
  down = [],
  showIfaces = true,
}: {
  topo: Topology
  packets: PacketAnim[]
  t: number
  highlight?: string[]
  down?: string[]
  showIfaces?: boolean
}) {
  const shownLabel = new Set<string>()
  return (
    <svg viewBox={`0 0 ${topo.width} ${topo.height}`} className="svg-text h-auto w-full select-none" role="img" aria-label="Diagrama de la topología">
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.25" />
        </filter>
      </defs>
      {/* Segmentos */}
      {topo.segments.map((s) => {
        const devs = attached(topo, s.id)
        if (s.kind === 'bus') {
          return (
            <g key={s.id}>
              <line x1={s.x1} y1={s.y} x2={s.x2} y2={s.y} stroke="#0f766e" strokeWidth={6} strokeLinecap="round" opacity={0.85} />
              <text x={s.x1! + 4} y={s.y! - 12} fontSize={15} fontWeight={600} fill="#0f766e">
                {s.label}
                <tspan fontWeight={400} fill="#475569" dx={8}>{s.sub}</tspan>
              </text>
              {devs.map((d) => (
                <line key={d.id} x1={d.x} y1={d.y} x2={d.x} y2={s.y} stroke="#94a3b8" strokeWidth={3} opacity={d.muted ? 0.4 : 1} />
              ))}
            </g>
          )
        }
        if (devs.length < 2) return null
        const [a, b] = devs
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        const vertical = Math.abs(a.x - b.x) < 20
        return (
          <g key={s.id}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#94a3b8" strokeWidth={4} strokeDasharray={s.dashed ? '8 6' : undefined} />
            <g transform={vertical ? `translate(${mx - 12} ${my})` : `translate(${mx} ${my - 30})`}>
              <text textAnchor={vertical ? 'end' : 'middle'} fontSize={14} fontWeight={600} fill="#0f766e">
                {s.label}
              </text>
              <text textAnchor={vertical ? 'end' : 'middle'} y={16} fontSize={12} fill="#475569">
                {s.sub}
              </text>
            </g>
          </g>
        )
      })}
      {/* Interfaces */}
      {showIfaces &&
        topo.devices.map((d) =>
          d.ifaces.map((i) => {
            const seg = topo.segments.find((s) => s.id === i.segment)
            if (!seg) return null
            const other = attached(topo, i.segment).find((x) => x.id !== d.id)
            let x: number
            let y: number
            let anchor: 'start' | 'end' | 'middle' = 'start'
            if (seg.kind === 'bus') {
              const ap = attachPoint(topo, d, seg.id)
              x = d.x + 8
              y = ap.y < d.y ? ap.y + 24 : (d.y + ap.y) / 2 + 6
            } else if (other && Math.abs(other.x - d.x) < 20) {
              x = d.x + 8
              y = d.y + (other.y > d.y ? 78 : -76)
            } else if (other) {
              // En enlaces horizontales se escalonan: el de la izquierda arriba, el de la derecha abajo.
              const dir = Math.sign(other.x - d.x)
              x = d.x + dir * 34
              y = d.y + (dir > 0 ? 22 : 50)
              anchor = dir > 0 ? 'start' : 'end'
            } else return null
            return (
              <text key={d.id + i.name} x={x} y={y} textAnchor={anchor} fontSize={11.5} fill="#334155" opacity={d.muted ? 0.4 : 1}>
                <tspan fontWeight={600}>{i.name}</tspan>
                {i.ip && <tspan dx={4}>{i.ip}/{i.prefix}</tspan>}
                <tspan x={x} dy={13} fill="#64748b" fontSize={10.5}>{i.mac}</tspan>
              </text>
            )
          }),
        )}
      {/* Dispositivos */}
      {topo.devices.map((d) => {
        const isDown = down.includes(d.id)
        const color = isDown ? '#94a3b8' : d.kind === 'router' ? '#0f766e' : '#334155'
        const hl = highlight.includes(d.id)
        return (
          <g key={d.id} opacity={d.muted ? 0.45 : 1}>
            {hl && <circle cx={d.x} cy={d.y} r={40} fill="#fde68a" opacity={0.7} />}
            {d.kind === 'router' ? <RouterIcon d={d} color={color} /> : <HostIcon d={d} color={color} />}
            {isDown && (
              <g stroke="#dc2626" strokeWidth={5} strokeLinecap="round">
                <line x1={d.x - 20} y1={d.y - 20} x2={d.x + 20} y2={d.y + 20} />
                <line x1={d.x + 20} y1={d.y - 20} x2={d.x - 20} y2={d.y + 20} />
              </g>
            )}
            <text x={d.x} y={d.y - 36} textAnchor="middle" fontSize={15} fontWeight={700} fill="#0f172a">
              {d.label}
            </text>
            {d.note && (
              <text x={d.x} y={d.y - 52} textAnchor="middle" fontSize={11} fill="#64748b">
                {d.note}
              </text>
            )}
          </g>
        )
      })}
      {/* Paquetes */}
      {packets.map((p, i) => {
        const pts = packetPath(topo, p)
        const tt = p.lost ? Math.min(t, 0.55) : t
        const pos = pointAt(pts, tt)
        const color = KIND_COLOR[p.kind]
        const showLabel = !shownLabel.has(p.fid)
        shownLabel.add(p.fid)
        const fading = p.lost && t > 0.55
        return (
          <g key={`${p.fid}-${i}`} opacity={t <= 0 ? 0 : fading ? Math.max(0.15, 1 - (t - 0.55) * 2) : 1} filter="url(#glow)">
            <rect x={pos.x - 13} y={pos.y - 9} width={26} height={18} rx={4} fill={color} stroke="white" strokeWidth={2} />
            <path d={`M${pos.x - 9} ${pos.y - 5} l9 6 l9 -6`} stroke="white" strokeWidth={1.6} fill="none" />
            {fading && (
              <text x={pos.x} y={pos.y + 30} textAnchor="middle" fontSize={13} fontWeight={700} fill="#dc2626">
                ✕ se pierde
              </text>
            )}
            {showLabel && (
              <g>
                <rect x={pos.x - 4} y={pos.y - 34} width={Math.max(60, p.label.length * 7.2)} height={20} rx={10} fill="white" stroke={color} />
                <text x={pos.x + 6} y={pos.y - 20} fontSize={12} fontWeight={600} fill={color}>
                  {p.label}
                </text>
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}
