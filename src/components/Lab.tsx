import { useEffect, useMemo, useRef, useState } from 'react'
import type { PacketAnim, Step, TableData, Topology } from '../sim/types'
import TopologyView, { KIND_COLOR } from './TopologyView'

const SPEEDS = [0.5, 1, 1.5, 2, 3]

export interface SniffNode {
  id: string
  label: string
}

export default function Lab({ topo, steps, sniffNodes }: { topo: Topology; steps: Step[]; sniffNodes?: SniffNode[] }) {
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [t, setT] = useState(1)
  const [pk, setPk] = useState(0)
  const [showIfaces, setShowIfaces] = useState(true)
  const [replay, setReplay] = useState(0)
  const raf = useRef<number | null>(null)
  const step = steps[Math.min(idx, steps.length - 1)]
  const curTopo = step?.topo ?? topo

  // Animación del paso actual
  useEffect(() => {
    setPk(0)
    if (!step || step.packets.length === 0) {
      setT(1)
      return
    }
    const dur = 1700 / speed
    const start = performance.now()
    const tick = (now: number) => {
      const f = Math.min(1, (now - start) / dur)
      setT(f)
      if (f < 1) raf.current = requestAnimationFrame(tick)
    }
    setT(0)
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, steps, replay])

  // Avance automático
  useEffect(() => {
    if (!playing || t < 1) return
    if (idx >= steps.length - 1) {
      setPlaying(false)
      return
    }
    const id = setTimeout(() => setIdx((i) => i + 1), (step?.packets.length ? 900 : 2200) / speed)
    return () => clearTimeout(id)
  }, [playing, t, idx, steps.length, speed, step])

  const go = (i: number) => setIdx(Math.max(0, Math.min(steps.length - 1, i)))

  const uniquePackets = useMemo(() => {
    const seen = new Set<string>()
    const out: PacketAnim[] = []
    for (const p of step?.packets ?? []) {
      if (!seen.has(p.fid)) {
        seen.add(p.fid)
        out.push(p)
      }
    }
    return out
  }, [step])

  if (!step) return null
  const prev = idx > 0 ? steps[idx - 1] : undefined

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="relative bg-gradient-to-b from-slate-50 to-white p-2 sm:p-4">
          <div className="overflow-x-auto">
            <div className="min-w-[680px]">
              <TopologyView topo={curTopo} packets={step.packets} t={t} highlight={step.highlight} down={step.down} showIfaces={showIfaces} />
            </div>
          </div>
          <p className="mt-1 text-center text-xs text-slate-400 sm:hidden">← deslizá para ver toda la topología →</p>
          <Legend packets={step.packets} />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2.5">
          <Btn onClick={() => { setPlaying(false); go(0) }} title="Reiniciar">⏮</Btn>
          <Btn onClick={() => { setPlaying(false); go(idx - 1) }} title="Paso anterior" disabled={idx === 0}>◀</Btn>
          <button
            onClick={() => {
              if (idx >= steps.length - 1) go(0)
              setPlaying((p) => !p)
            }}
            className="rounded-lg bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-teal-800"
          >
            {playing ? '❚❚ Pausa' : '▶ Reproducir'}
          </button>
          <Btn onClick={() => { setPlaying(false); go(idx + 1) }} title="Paso siguiente" disabled={idx >= steps.length - 1}>▶</Btn>
          <Btn onClick={() => setReplay((r) => r + 1)} title="Repetir la animación del paso">↻</Btn>
          <label className="ml-1 flex items-center gap-1 text-sm text-slate-600">
            Velocidad
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-sm">
              {SPEEDS.map((s) => (
                <option key={s} value={s}>{s}×</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 text-sm text-slate-600">
            <input type="checkbox" checked={showIfaces} onChange={(e) => setShowIfaces(e.target.checked)} /> interfaces
          </label>
          <span className="ml-auto text-sm font-medium text-slate-600">
            Paso {idx + 1} / {steps.length}
          </span>
          <input
            type="range"
            min={0}
            max={steps.length - 1}
            value={idx}
            onChange={(e) => { setPlaying(false); go(Number(e.target.value)) }}
            className="w-full accent-teal-700"
            aria-label="Línea de tiempo"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <div className={`rounded-2xl border bg-white p-4 shadow-sm ${step.status === 'fail' ? 'border-red-300' : step.status === 'ok' ? 'border-green-300' : 'border-slate-200'}`}>
            <div className="mb-1 flex items-start gap-2">
              <StatusDot status={step.status} />
              <h3 className="text-base font-semibold text-slate-900 sm:text-lg">{step.title}</h3>
            </div>
            <p className="text-[15px] leading-relaxed text-slate-700">{step.text}</p>
            {step.cmd && (
              <div className="mt-3">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Comando</div>
                <pre className="rounded-lg bg-slate-900 p-3 font-mono text-[13px] text-teal-200">{step.cmd}</pre>
              </div>
            )}
            {step.output && (
              <div className="mt-3">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Salida</div>
                <pre className="rounded-lg bg-slate-800 p-3 font-mono text-[12.5px] text-slate-100">{step.output}</pre>
              </div>
            )}
          </div>
          <Inspector packets={uniquePackets} all={step.packets} sel={pk} onSel={setPk} />
        </div>
        <div className="lg:col-span-2">
          <Tables tables={step.tables} prev={prev?.tables} highlight={step.highlight} topo={curTopo} />
        </div>
      </div>

      {sniffNodes && sniffNodes.length > 0 && <Sniffer steps={steps} idx={idx} nodes={sniffNodes} />}

      <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" open>
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">Todos los pasos de este escenario</summary>
        <ol className="mt-3 grid gap-1 sm:grid-cols-2">
          {steps.map((s, i) => (
            <li key={i}>
              <button
                onClick={() => { setPlaying(false); go(i) }}
                className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${i === idx ? 'bg-teal-50 font-semibold text-teal-900 ring-1 ring-teal-300' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <span className="w-6 shrink-0 text-right text-slate-400">{i + 1}.</span>
                <StatusDot status={s.status} small />
                <span>{s.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </details>
    </section>
  )
}

function Btn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-40" />
}

function StatusDot({ status, small }: { status?: Step['status']; small?: boolean }) {
  const c = status === 'fail' ? 'bg-red-500' : status === 'ok' ? 'bg-green-500' : status === 'info' ? 'bg-sky-500' : 'bg-slate-300'
  return <span className={`mt-1.5 inline-block shrink-0 rounded-full ${c} ${small ? 'h-2 w-2' : 'h-2.5 w-2.5'}`} />
}

function Legend({ packets }: { packets: PacketAnim[] }) {
  const kinds = Array.from(new Set(packets.map((p) => p.kind)))
  if (!kinds.length) return null
  const names: Record<string, string> = {
    'arp-req': 'ARP request (broadcast)',
    'arp-rep': 'ARP reply (unicast)',
    'icmp-req': 'ICMP echo request',
    'icmp-rep': 'ICMP echo reply',
    ospf: 'OSPF',
    bgp: 'BGP',
    tcp: 'TCP',
    dhcp: 'DHCP',
    error: 'error',
  }
  return (
    <div className="mt-1 flex flex-wrap justify-end gap-2 text-xs sm:absolute sm:bottom-2 sm:right-3 sm:mt-0">
      {kinds.map((k) => (
        <span key={k} className="flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 shadow-sm ring-1 ring-slate-200">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: KIND_COLOR[k] }} />
          {names[k]}
        </span>
      ))}
    </div>
  )
}

function Inspector({ packets, all, sel, onSel }: { packets: PacketAnim[]; all: PacketAnim[]; sel: number; onSel: (i: number) => void }) {
  const fanout = (fid: string) => all.filter((x) => x.fid === fid).length
  const p = packets[Math.min(sel, packets.length - 1)]
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Inspector de paquetes</h3>
        {packets.length > 1 &&
          packets.map((q, i) => (
            <button
              key={q.fid}
              onClick={() => onSel(i)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${i === sel ? 'text-white' : 'bg-slate-100 text-slate-700'}`}
              style={i === sel ? { background: KIND_COLOR[q.kind] } : undefined}
            >
              {q.from} → {fanout(q.fid) > 1 ? 'todos' : q.to} · {q.label}
            </button>
          ))}
      </div>
      {!p ? (
        <p className="text-sm text-slate-500">En este paso no viaja ningún paquete: es configuración, un cálculo interno o el resultado.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {p.layers.map((l) => (
            <div key={l.title} className="overflow-hidden rounded-lg border border-slate-200">
              <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white" style={{ background: KIND_COLOR[p.kind] }}>
                {l.title}
              </div>
              <dl className="divide-y divide-slate-100 text-[13px]">
                {l.fields.map((f) => (
                  <div key={f.k} className={`grid grid-cols-[minmax(7rem,40%)_1fr] gap-2 px-3 py-1 ${f.hl ? 'bg-amber-50' : ''}`}>
                    <dt className="text-slate-500">{f.k}</dt>
                    <dd className="break-words font-mono text-slate-900">{f.v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Tables({ tables, prev, highlight, topo }: { tables: TableData[]; prev?: TableData[]; highlight?: string[]; topo: Topology }) {
  const groups = Array.from(new Set(tables.map((t) => t.group)))
  const [pinned, setPinned] = useState<string[] | null>(null)
  const labels = (highlight ?? []).map((id) => topo.devices.find((d) => d.id === id)?.label ?? id)
  const auto = groups.filter((g) => labels.some((l) => g === l || g.startsWith(l + ' ')))
  const active = pinned ?? (auto.length ? auto : groups)
  const toggle = (g: string) => {
    const base = pinned ?? active
    const next = base.includes(g) ? base.filter((x) => x !== g) : [...base, g]
    setPinned(next.length ? next : null)
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Tablas en vivo</h3>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <button onClick={() => setPinned(null)} className={`rounded-full px-2.5 py-0.5 text-xs ${pinned === null ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700'}`}>
          auto
        </button>
        <button onClick={() => setPinned(groups)} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">
          todas
        </button>
        {groups.map((g) => (
          <button key={g} onClick={() => toggle(g)} className={`rounded-full px-2.5 py-0.5 text-xs ${active.includes(g) ? 'bg-teal-100 font-semibold text-teal-900 ring-1 ring-teal-300' : 'bg-slate-100 text-slate-600'}`}>
            {g}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {tables
          .filter((t) => active.includes(t.group))
          .map((t) => {
            const old = new Set((prev?.find((p) => p.id === t.id)?.rows ?? []).map((r) => r.join('|')))
            const hasPrev = !!prev?.find((p) => p.id === t.id)
            return (
              <div key={t.id} className="overflow-x-auto rounded-lg border border-slate-200">
                <div className="bg-slate-100 px-3 py-1.5 font-mono text-xs font-semibold text-slate-700">{t.title}</div>
                {t.rows.length === 0 ? (
                  <div className="px-3 py-2 text-xs italic text-slate-400">{t.empty ?? 'vacía'}</div>
                ) : (
                  <table className="w-full text-left font-mono text-[12px]">
                    <thead>
                      <tr className="text-slate-500">
                        {t.columns.map((c) => (
                          <th key={c} className="px-2 py-1 font-semibold">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {t.rows.map((r, i) => {
                        const isNew = hasPrev && !old.has(r.join('|'))
                        return (
                          <tr key={i} className={`border-t border-slate-100 ${isNew ? 'bg-amber-100 transition-colors' : ''}`}>
                            {r.map((c, j) => (
                              <td key={j} className="whitespace-nowrap px-2 py-1 text-slate-800">{c}</td>
                            ))}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        <span className="rounded bg-amber-100 px-1">Resaltado</span> = cambió en este paso. Flags de ruta: D dinámica, A activa, c conectada, s estática, o OSPF, b BGP.
      </p>
    </div>
  )
}

function Sniffer({ steps, idx, nodes }: { steps: Step[]; idx: number; nodes: SniffNode[] }) {
  const [node, setNode] = useState(nodes[0].id)
  const rows: { step: number; iface: string; dir: string; sm: string; dm: string; si: string; di: string; proto: string }[] = []
  const txSeen = new Set<string>()
  steps.slice(0, idx + 1).forEach((s, si) => {
    for (const p of s.packets) {
      if (!p.frame) continue
      if (p.from === node && !txSeen.has(p.fid)) {
        txSeen.add(p.fid)
        rows.push({ step: si, iface: p.frame.fromIface, dir: 'tx', sm: p.frame.srcMac, dm: p.frame.dstMac, si: p.frame.srcIp, di: p.frame.dstIp, proto: p.frame.proto })
      } else if (p.to === node && !p.lost) {
        rows.push({ step: si, iface: p.frame.toIface, dir: 'rx', sm: p.frame.srcMac, dm: p.frame.dstMac, si: p.frame.srcIp, di: p.frame.dstIp, proto: p.frame.proto })
      }
    }
  })
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Packet Sniffer (como en WinBox)</h3>
        <select value={node} onChange={(e) => setNode(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>capturando en {n.label}</option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-[12px]">
          <thead className="text-slate-500">
            <tr>
              {['Num', 'Interface', 'Dir', 'Src. MAC Address', 'Dst. MAC Address', 'Src. Address', 'Dst. Address', 'Proto'].map((h) => (
                <th key={h} className="whitespace-nowrap px-2 py-1">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-2 py-2 italic text-slate-400">Todavía no pasó ninguna trama por este nodo.</td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={i} className={`border-t border-slate-100 ${r.step === idx ? 'bg-amber-100' : ''}`}>
                <td className="px-2 py-1">{i + 1}</td>
                <td className="px-2 py-1">{r.iface}</td>
                <td className="px-2 py-1">{r.dir}</td>
                <td className="whitespace-nowrap px-2 py-1">{r.sm}</td>
                <td className="whitespace-nowrap px-2 py-1">{r.dm}</td>
                <td className="px-2 py-1">{r.si}</td>
                <td className="px-2 py-1">{r.di}</td>
                <td className="px-2 py-1">{r.proto}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">2054 = ARP (sin IP: es una pregunta de capa 2) · 2048 = IPv4 (acá aparecen las IP).</p>
    </div>
  )
}
