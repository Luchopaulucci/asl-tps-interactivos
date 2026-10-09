import { useState } from 'react'
import { Card } from './Content'

export default function ScaleWidget({ highlightOspf = false }: { highlightOspf?: boolean }) {
  const [n, setN] = useState(4)
  const statics = n * (n - 1)
  const ospf = 4 * n
  const max = Math.max(statics, ospf, 1)
  return (
    <Card title="¿Cuánto cuesta? Estáticas N×(N−1) vs OSPF 4×N">
      <label className="flex items-center gap-3 text-sm">
        Routers: <input type="range" min={2} max={40} value={n} onChange={(e) => setN(Number(e.target.value))} className="flex-1 accent-teal-700" />
        <b className="w-8 text-right">{n}</b>
      </label>
      <div className="space-y-2">
        <div>
          <div className="flex justify-between text-sm"><span>Rutas estáticas (P3)</span><b>{statics}</b></div>
          <div className="h-3 rounded bg-slate-100"><div className="h-3 rounded bg-amber-500" style={{ width: `${(statics / max) * 100}%` }} /></div>
        </div>
        <div>
          <div className="flex justify-between text-sm"><span>Líneas de OSPF (P4): instancia + área + 2 redes</span><b>{ospf}</b></div>
          <div className="h-3 rounded bg-slate-100"><div className={`h-3 rounded ${highlightOspf ? 'bg-violet-600' : 'bg-violet-400'}`} style={{ width: `${(ospf / max) * 100}%` }} /></div>
        </div>
      </div>
      <p className="text-sm">
        {n === 4
          ? 'Con 4 routers: 12 estáticas contra 16 líneas de OSPF. OSPF pierde en volumen…'
          : statics > ospf
            ? `…pero con ${n} routers gana OSPF por ${statics - ospf}. La ganancia es de crecimiento, no de volumen. Y en P3, sumar el router ${n + 1} obliga a tocar los ${n} anteriores; con OSPF sólo se configura el nuevo.`
            : 'Con pocos routers, las estáticas cuestan menos líneas.'}
      </p>
    </Card>
  )
}
