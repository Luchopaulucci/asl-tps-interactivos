import type { ReactNode } from 'react'

export function PageHeader({ tag, title, subtitle, chips }: { tag: string; title: string; subtitle: ReactNode; chips?: string[] }) {
  return (
    <header className="mb-6">
      <div className="text-sm font-semibold uppercase tracking-wider text-teal-700">{tag}</div>
      <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>
      <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-slate-600">{subtitle}</p>
      {chips && (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <span key={c} className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800 ring-1 ring-teal-200">
              {c}
            </span>
          ))}
        </div>
      )}
    </header>
  )
}

export function Card({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {title && <h2 className="mb-3 text-lg font-semibold text-slate-900">{title}</h2>}
      <div className="space-y-3 text-[15px] leading-relaxed text-slate-700">{children}</div>
    </section>
  )
}

export function Controls({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-teal-200 bg-teal-50/60 p-3 sm:p-4">{children}</div>
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-[10rem] flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      {children}
    </label>
  )
}

export const selectCls = 'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm shadow-sm'

export function ScenarioTabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${value === o.id ? 'bg-teal-700 text-white shadow' : 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Commands({ items }: { items: { cmd: string; what: string; where?: string }[] }) {
  return (
    <Card title="Comandos de la práctica">
      <div className="space-y-2">
        {items.map((c) => (
          <div key={c.cmd} className="grid min-w-0 gap-1 rounded-lg border border-slate-200 p-2.5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:gap-3">
            <pre className="max-w-full overflow-x-auto rounded-md bg-slate-900 px-2.5 py-1.5 font-mono text-[12.5px] text-teal-200">{c.cmd}</pre>
            <div className="text-sm">
              {c.where && <span className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">{c.where}</span>}
              {c.what}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

export function Questions({ items }: { items: { q: string; a: ReactNode }[] }) {
  return (
    <Card title="Preguntas de cierre (repaso)">
      <ol className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className="rounded-lg border border-slate-200 p-3">
            <div className="font-medium text-slate-900">
              {i + 1}. {it.q}
            </div>
            <details className="mt-1">
              <summary className="cursor-pointer text-sm text-teal-700">Ver pista / respuesta sugerida</summary>
              <div className="mt-1 text-sm text-slate-700">{it.a}</div>
            </details>
          </li>
        ))}
      </ol>
    </Card>
  )
}

export function Informe({ items, rubric }: { items: string[]; rubric?: [string, number][] }) {
  return (
    <Card title="Qué va al informe">
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={it} className="flex gap-2">
            <input type="checkbox" className="mt-1 accent-teal-700" aria-label={it} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
      {rubric && (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1">Rúbrica</th>
              <th className="py-1 text-right">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rubric.map(([c, p]) => (
              <tr key={c} className="border-t border-slate-100">
                <td className="py-1">{c}</td>
                <td className="py-1 text-right font-semibold">{p}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs text-slate-500">Plantilla de la Guía 0: topología + /interface print, direccionamiento, procedimiento (/export), evidencia, análisis y conclusión.</p>
    </Card>
  )
}

export function Trouble({ rows }: { rows: [string, string, string][] }) {
  return (
    <Card title="Troubleshooting">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="py-1 pr-3">Síntoma</th>
              <th className="py-1 pr-3">Causa probable</th>
              <th className="py-1">Qué mirar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]} className="border-t border-slate-100 align-top">
                <td className="py-1.5 pr-3 font-medium text-slate-800">{r[0]}</td>
                <td className="py-1.5 pr-3">{r[1]}</td>
                <td className="py-1.5 font-mono text-[13px]">{r[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export function Grid2({ children }: { children: ReactNode }) {
  return <div className="mt-6 grid min-w-0 gap-4 lg:grid-cols-2 [&>*]:min-w-0">{children}</div>
}
