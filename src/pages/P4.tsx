import { useMemo, useState } from 'react'
import Lab from '../components/Lab'
import { Card, Commands, Controls, Field, Grid2, Informe, PageHeader, Questions, ScenarioTabs, Trouble, selectCls } from '../components/Content'
import ScaleWidget from '../components/ScaleWidget'
import { backboneOnly } from '../data/topologies'
import { OspfSim, defaultOspfRouters } from '../sim/ospf'
import type { Topology } from '../sim/types'

type Scn = 'converge' | 'fail' | 'missing'

function topoWithRid(): Topology {
  const t = backboneOnly('10.10.10.0/24 · área OSPF 0.0.0.0')
  return { ...t, devices: t.devices.map((d) => ({ ...d, note: `router-id ${d.ifaces[0].ip}` })) }
}

export default function P4() {
  const [scn, setScn] = useState<Scn>('converge')
  const [victim, setVictim] = useState('R3')
  const [culprit, setCulprit] = useState('R2')
  const topo = useMemo(topoWithRid, [])
  const steps = useMemo(() => {
    if (scn === 'converge') return new OspfSim(topo, defaultOspfRouters()).converge().steps
    if (scn === 'fail') {
      const probe = victim === 'R1' ? 'R2' : 'R1'
      return new OspfSim(topo, defaultOspfRouters()).convergeSilently().failRouter(victim, probe).steps
    }
    const probe = culprit === 'R1' ? 'R2' : 'R1'
    return new OspfSim(topo, defaultOspfRouters({ [culprit]: false })).convergeSilently().missingLan(culprit, probe).steps
  }, [scn, victim, culprit, topo])

  return (
    <div>
      <PageHeader
        tag="Práctica 4 · Unidad 3 · Ruteo dinámico"
        title="OSPF: las mismas rutas, y esta vez no las escribe nadie"
        subtitle="Misma topología que P3. Lo único que cambia es quién llena la tabla: cada router anuncia lo que tiene y aprende lo de los demás. Mirá los Hello, la elección de DR/BDR, las adyacencias Full, la inundación de LSA y el cálculo SPF. Después apagá un router."
        chips={['área 0.0.0.0 (backbone)', 'router-id = IP de backbone', 'Hello 10 s · Dead 40 s', 'distance OSPF 110', 'DR = R4 · BDR = R3']}
      />
      <Controls>
        <ScenarioTabs
          value={scn}
          onChange={setScn}
          options={[
            { id: 'converge', label: 'Convergencia desde cero' },
            { id: 'fail', label: 'Apagar un router (paso 8)' },
            { id: 'missing', label: 'Error: LAN sin anunciar' },
          ]}
        />
        {scn === 'fail' && (
          <Field label="Router que se apaga">
            <select className={selectCls} value={victim} onChange={(e) => setVictim(e.target.value)}>
              <option value="R1">R1 (DROther)</option>
              <option value="R2">R2 (DROther)</option>
              <option value="R3">R3 (BDR) — el de la guía</option>
              <option value="R4">R4 (DR)</option>
            </select>
          </Field>
        )}
        {scn === 'missing' && (
          <Field label="Router que se olvidó la LAN">
            <select className={selectCls} value={culprit} onChange={(e) => setCulprit(e.target.value)}>
              {['R1', 'R2', 'R3', 'R4'].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Field>
        )}
      </Controls>
      <Lab key={`${scn}-${victim}-${culprit}`} topo={topo} steps={steps} />
      <Grid2>
        <Card title="Full, 2-Way, DR y BDR">
          <p><b>Full</b> = los dos vecinos terminaron de intercambiar sus bases de estado de enlace y tienen la misma vista del área. Recién desde Full se calculan rutas.</p>
          <p>En un segmento compartido OSPF no sincroniza todos con todos: elige un <b>DR</b> y un <b>BDR</b> (prioridades iguales → gana el router-id más alto: <b>R4 = DR, R3 = BDR</b>). Los <b>DROther</b> (R1 y R2) hacen Full sólo con esos dos. Las adyacencias pasan de N×(N−1)/2 a 2N.</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-violet-50 p-2"><b>R4 y R3</b>: 3 vecinos en Full.</div>
            <div className="rounded-lg bg-slate-100 p-2"><b>R1 y R2</b>: 2 Full (DR y BDR) + 1 en 2-Way (el otro DROther).</div>
          </div>
          <p className="text-sm">Ese 2-Way entre R1 y R2 <b>no es una falla</b>: ya tienen la LSDB completa, se la dio el DR. Si lo "arreglás" tocando el área o los anuncios, rompés algo que andaba.</p>
        </Card>
        <Card title="¿Qué pasa si te olvidás de una red?">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm"><b>Falta el backbone:</b> no hay adyacencia con nadie (los Hello salen justamente por esa interfaz). <code>neighbor print</code> vacío.</div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><b>Falta la LAN propia:</b> vecinos en Full, todo parece correcto, pero esa LAN no existe para los demás. Probá el escenario "LAN sin anunciar".</div>
          </div>
          <p className="text-sm">Detección de un router caído: hasta ~40 s (dead interval = 4 Hello). El recálculo después es inmediato, y nadie toca nada. En P2/P3 esa ruta habría quedado apuntando a un router muerto para siempre.</p>
        </Card>
      </Grid2>
      <Grid2>
        <Commands
          items={[
            { cmd: '/ip route remove [find comment~"LAN R"]', what: 'Paso 1: borrar las estáticas de P3 (sólo rutas, nunca /ip address). Verificación: el ping a 192.168.3.1 tiene que fallar.' },
            { cmd: '/routing ospf instance add name=default router-id=10.10.10.2', what: 'Instancia con router-id único (convención: la IP de backbone).', where: 'R2' },
            { cmd: '/routing ospf area add name=backbone area-id=0.0.0.0 instance=default', what: 'Área troncal. name es una etiqueta local; area-id es lo que viaja por el cable y tiene que coincidir en los cuatro.' },
            { cmd: '/routing ospf interface-template add networks=10.10.10.0/24 area=backbone\n/routing ospf interface-template add networks=192.168.2.0/24 area=backbone', what: 'Anuncia el backbone (por donde salen los Hello) y la LAN propia. networks= va en plural en v7. En v6 era /routing ospf network.', where: 'R2' },
            { cmd: '/routing ospf neighbor print', what: 'Los tres vecinos, con su estado (Full / 2-Way).' },
            { cmd: '/ip route print where ospf', what: 'LAN remotas con protocolo OSPF y gateway = IP de backbone del dueño.' },
            { cmd: '/ping 192.168.3.1\n/tool traceroute 192.168.3.1', what: 'La conectividad que rompiste en el paso 1, ahora traída por OSPF.' },
          ]}
        />
        <ScaleWidget highlightOspf />
      </Grid2>
      <Grid2>
        <Questions
          items={[
            { q: '¿Cuántas líneas de configuración de OSPF hiciste contra cuántas rutas estáticas en P3? ¿Cuál gana con 4 routers, y cuál con 20?', a: '4 por router (instancia + área + 2 redes) = 16 contra 12 estáticas. Con 4 gana la estática; con 20, OSPF: 80 contra 380.' },
            { q: 'Mostrá /routing ospf neighbor print y explicá Full. ¿Por qué un vecino en 2-Way no alcanza? ¿Quién es DR y BDR?', a: 'Full = LSDB sincronizada. 2-Way sólo dice que se ven mutuamente; no intercambiaron mapa. Igual, entre dos DROther 2-Way es lo esperado porque el mapa lo distribuye el DR. DR = R4 y BDR = R3 por router-id más alto con prioridades iguales.' },
            { q: 'Apagá un router y observá la tabla del resto. ¿Cuánto tardó en reconverger, y por qué ese número?', a: 'Hasta ~40 s: el dead interval por defecto (4 × Hello de 10 s). Después, la inundación y el SPF son casi instantáneos. Si cae el DR, el BDR asciende y se elige un BDR nuevo.' },
            { q: '¿Qué ventaja tiene OSPF cuando se suma un router nuevo? ¿A quiénes hay que configurar?', a: 'Sólo al nuevo, con sus mismas 4 líneas. Los demás aprenden su LAN por inundación y recalculan.' },
          ]}
        />
        <div className="space-y-4">
          <Informe
            items={['Instancia, área y redes anunciadas en los cuatro routers.', 'Vecinos: /routing ospf neighbor print con los tres vecinos visibles (y el rol de cada uno).', 'Rutas aprendidas por OSPF: /ip route print where ospf, al lado de la tabla estática de P3.', 'Conectividad sin rutas estáticas: ping y traceroute entre LAN, y la evidencia de que no quedan estáticas.', 'Las cuatro preguntas de cierre, con el conteo de líneas y el tiempo de reconvergencia.']}
            rubric={[['Instancia + área + redes anunciadas', 25], ['Adyacencias correctas: Full con DR y BDR, rol de cada nodo', 25], ['Rutas aprendidas por OSPF (evidencia)', 25], ['Conectividad sin rutas estáticas', 15], ['Preguntas de cierre', 10]]}
          />
          <Trouble
            rows={[
              ['Vecinos vacío', 'backbone no anunciado', 'interface-template del paso 4'],
              ['Todos en Init / 2-Way', 'area-id distinto', 'el área, en los cuatro'],
              ['Dos DROther en 2-Way entre sí', 'ninguna: es lo esperado', 'que tengan Full con DR y BDR'],
              ['Adyacencias inestables', 'router-id duplicado', 'tabla del paso 2'],
              ['Vecinos en Full pero falta una LAN', 'esa LAN no se anunció', 'la 2.ª línea del paso 4, en el dueño'],
              ['El ping anda pero no hay rutas o', 'quedó una estática viva', 'volver al paso 1'],
            ]}
          />
        </div>
      </Grid2>
    </div>
  )
}
