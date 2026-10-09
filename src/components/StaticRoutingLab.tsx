import { useMemo, useState } from 'react'
import Lab from './Lab'
import { Controls, Field, selectCls } from './Content'
import type { RoutePreset } from '../data/staticRoutes'
import { clientDefaults } from '../data/topologies'
import { initialState, simulatePing } from '../sim/net'
import type { Step, Topology } from '../sim/types'

export default function StaticRoutingLab({
  topo,
  presets,
  defaultPreset,
  defaultFrom = 'C1',
  defaultTo = '192.168.4.10',
  failable = [],
}: {
  topo: Topology
  presets: RoutePreset[]
  defaultPreset: string
  defaultFrom?: string
  defaultTo?: string
  failable?: string[]
}) {
  const [presetId, setPresetId] = useState(defaultPreset)
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [down, setDown] = useState('')
  const preset = presets.find((p) => p.id === presetId)!
  const targets = topo.devices.flatMap((d) => d.ifaces.filter((i) => i.ip).map((i) => ({ ip: i.ip!, label: `${i.ip} (${d.label} ${i.name})`, dev: d.id })))

  const steps = useMemo<Step[]>(() => {
    const st = initialState(topo, { ...preset.routes, ...clientDefaults }, down ? [down] : [])
    const fromLabel = topo.devices.find((d) => d.id === from)!.label
    const intro: Step = {
      title: `Rutas cargadas: ${preset.label}`,
      text: `${preset.description} Total de rutas estáticas en los routers: ${Object.entries(preset.routes).reduce((a, [, r]) => a + r.length, 0)}. Los clientes tienen su ruta por defecto hacia el router de su LAN. Ahora ${fromLabel} hace ping a ${to}${down ? ` con ${down} apagado` : ''}.`,
      cmd: Object.entries(preset.routes)
        .map(([id, rs]) => `# ${id}\n${rs.map((r) => `/ip route add dst-address=${r.dst} gateway=${r.gateway} comment="${r.comment}"`).join('\n')}`)
        .join('\n') || '# sin /ip route add: sólo redes conectadas',
      packets: [],
      tables: [],
      status: 'info',
      down: down ? [down] : [],
    }
    const res = simulatePing(topo, st, { from, to, cmd: `/ping ${to}` })
    intro.tables = res.steps[0]?.tables ?? []
    return [intro, ...res.steps]
  }, [topo, preset, from, to, down])

  return (
    <>
      <Controls>
        <Field label="Rutas estáticas cargadas">
          <select className={selectCls} value={presetId} onChange={(e) => setPresetId(e.target.value)}>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Origen del ping">
          <select
            className={selectCls}
            value={from}
            onChange={(e) => {
              const f = e.target.value
              setFrom(f)
              if (targets.find((t) => t.ip === to)?.dev === f) setTo(targets.find((t) => t.dev !== f)!.ip)
            }}
          >
            {topo.devices.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Destino">
          <select className={selectCls} value={to} onChange={(e) => setTo(e.target.value)}>
            {targets.filter((t) => t.dev !== from).map((t) => (
              <option key={t.ip} value={t.ip}>{t.label}</option>
            ))}
          </select>
        </Field>
        {failable.length > 0 && (
          <Field label="Apagar un router">
            <select className={selectCls} value={down} onChange={(e) => setDown(e.target.value)}>
              <option value="">(ninguno)</option>
              {failable.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </Field>
        )}
      </Controls>
      <Lab
        key={`${presetId}-${from}-${to}-${down}`}
        topo={topo}
        steps={steps}
        sniffNodes={topo.devices.filter((d) => d.kind === 'router').map((d) => ({ id: d.id, label: d.label }))}
      />
    </>
  )
}
