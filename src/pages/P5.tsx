import { useMemo, useState } from 'react'
import Lab from '../components/Lab'
import { Card, Commands, Controls, Grid2, Informe, PageHeader, Questions, ScenarioTabs, Trouble } from '../components/Content'
import { backboneOnly } from '../data/topologies'
import { makeBgp, type BgpOptions } from '../sim/bgp'
import type { Topology } from '../sim/types'

type Scn = 'normal' | 'ospf' | 'wrongas' | 'q4'

const OPTS: Record<Scn, BgpOptions> = {
  normal: {},
  ospf: { withOspf: true },
  wrongas: { wrongAs: true },
  q4: { r2WithR3: true },
}

function topoFor(scn: Scn): Topology {
  const t = backboneOnly('10.10.10.0/24 · sesión eBGP TCP 179')
  const notes: Record<string, string> = { R1: 'AS 65001 · rid .1', R2: scn === 'q4' ? 'AS 65002 (hipótesis)' : 'no participa', R3: 'AS 65003 · rid .3', R4: 'no participa' }
  return {
    ...t,
    devices: t.devices.map((d) => ({ ...d, note: notes[d.id], muted: d.id === 'R4' || (d.id === 'R2' && scn !== 'q4') })),
  }
}

export default function P5() {
  const [scn, setScn] = useState<Scn>('normal')
  const topo = useMemo(() => topoFor(scn), [scn])
  const steps = useMemo(() => makeBgp(topo, OPTS[scn]), [topo, scn])
  return (
    <div>
      <PageHeader
        tag="Práctica 5 · Unidad 3 · Ruteo dinámico"
        title="BGP: dos dueños distintos, y cada uno le cuenta al otro a dónde llega"
        subtitle="R1 y R3 dejan de ser parte de una misma red: son dos sistemas autónomos. En OSPF el vecino se descubría solo y se compartía el mapa entero; acá el vecino se declara a mano en las dos puntas y lo único que viaja es «a esta red llegás por mí». R2 y R4 siguen en el backbone pero no participan."
        chips={['R1 · AS 65001 · 10.10.10.1', 'R3 · AS 65003 · 10.10.10.3', 'TCP 179', 'established', 'eBGP distance 20']}
      />
      <Controls>
        <ScenarioTabs
          value={scn}
          onChange={setScn}
          options={[
            { id: 'normal', label: 'Sesión eBGP R1 ↔ R3' },
            { id: 'ospf', label: 'Viniendo de P4 (OSPF vivo)' },
            { id: 'wrongas', label: 'Error: remote.as mal' },
            { id: 'q4', label: 'Pregunta 4: R2 sólo con R3' },
          ]}
        />
      </Controls>
      <Lab key={scn} topo={topo} steps={steps} />
      <Grid2>
        <Card title="OSPF vs BGP, en una tabla">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500"><tr><th></th><th className="py-1">OSPF (P4)</th><th className="py-1">BGP (P5)</th></tr></thead>
            <tbody>
              {[
                ['Tipo', 'IGP: dentro de un AS', 'EGP: entre sistemas autónomos'],
                ['Vecinos', 'se descubren solos (Hello multicast)', 'se declaran a mano en las dos puntas'],
                ['Transporte', 'IP protocolo 89', 'TCP puerto 179'],
                ['Qué comparte', 'el mapa entero (LSA) y cada uno calcula SPF', 'destinos + atributos (AS_PATH, NEXT_HOP)'],
                ['Estado bueno', 'Full', 'established'],
                ['Distance en RouterOS', '110', 'eBGP 20'],
              ].map((r) => (
                <tr key={r[0]} className="border-t border-slate-100 align-top"><td className="py-1.5 pr-2 font-medium">{r[0]}</td><td className="pr-2">{r[1]}</td><td>{r[2]}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm">Si las VMs vienen de P4, el ping entre LAN anda con BGP o sin él: <b>el ping no prueba nada acá</b>. La prueba es <code>/ip route print where bgp</code>. Con los dos vivos gana la de menor distance (eBGP 20) y la OSPF queda de respaldo.</p>
        </Card>
        <Card title="Los parámetros de la conexión">
          <table className="w-full text-sm">
            <tbody>
              {[
                ['remote.address · remote.as', 'quién es el vecino: su IP y su AS'],
                ['instance=i1', 'la instancia del paso 1 (de ahí sale mi AS y mi router-id)'],
                ['local.role=ebgp', 'la sesión es con otro AS; dentro del mismo sería iBGP'],
                ['connect · listen', 'quién inicia la sesión TCP: acá, cualquiera de los dos'],
                ['output.redistribute=connected', 'qué anuncio: mis redes conectadas (ahí va la LAN, y también el backbone)'],
              ].map((r) => (
                <tr key={r[0]} className="border-t border-slate-100 align-top"><td className="py-1.5 pr-2 font-mono text-[13px]">{r[0]}</td><td>{r[1]}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm">En v7.20 no existe <code>/routing bgp network</code>: si copiás un tutorial de v6 falla por eso. El anuncio ya lo hace <code>output.redistribute=connected</code>. ASN privados 64512–65534 (como 192.168.x.x para direcciones).</p>
        </Card>
      </Grid2>
      <Grid2>
        <Commands
          items={[
            { cmd: '/routing bgp instance add name=i1 as=65001 router-id=10.10.10.1', what: 'Quién soy: mi AS y mi router-id. En R3: as=65003 router-id=10.10.10.3.', where: 'R1' },
            { cmd: '/routing bgp connection add name=peer-R3 \\\n    remote.address=10.10.10.3 remote.as=65003 \\\n    instance=i1 local.role=ebgp \\\n    connect=yes listen=yes output.redistribute=connected \\\n    comment="eBGP con R3"', what: 'Con quién hablo. Primero sólo en R1: mirá la sesión antes de configurar R3.', where: 'R1' },
            { cmd: '/routing bgp connection add name=peer-R1 \\\n    remote.address=10.10.10.1 remote.as=65001 ...', what: 'El espejo en R3. Los AS tienen que cruzarse.', where: 'R3' },
            { cmd: '/routing bgp session print', what: 'Estado de la sesión: tiene que decir established.' },
            { cmd: '/ip route print where bgp', what: 'La prueba de verdad: en R1, 192.168.3.0/24 con gateway 10.10.10.3; en R3, 192.168.1.0/24 vía 10.10.10.1.' },
            { cmd: '/ping 192.168.3.1\n/tool traceroute 192.168.3.1', what: 'El camino anda (desde R1). Va al informe junto con la tabla.', where: 'R1' },
          ]}
        />
        <Questions
          items={[
            { q: 'Diferencia conceptual OSPF vs BGP: ¿qué decide cada uno y a qué escala?', a: 'OSPF decide el mejor camino dentro de una organización (un AS), con el mapa completo y métrica de costo. BGP decide entre organizaciones, a escala de Internet: no comparte el mapa, sólo destinos y por qué AS se llega (política, AS_PATH).' },
            { q: '¿Por qué BGP exige declarar cada peer y OSPF no?', a: 'BGP corre sobre TCP entre dueños distintos: es una relación explícita (confianza/política), y la sesión TCP necesita saber con quién conectarse. OSPF descubre por multicast en el segmento porque todos los routers son de la misma administración.' },
            { q: 'Mostrá /routing bgp session print con sesiones established.', a: 'Con una sola punta configurada la sesión no sube (R3 contesta RST). Con las dos y los AS cruzados: established. Mirá los pasos 3–9 del escenario principal.' },
            { q: 'Si R2 abriera una sesión BGP sólo con R3, ¿R1 aprendería la LAN de R2? ¿Qué AS_PATH tendría?', a: 'Sí: R3 la reanuncia a R1 anteponiendo su AS. En R1 aparece 192.168.2.0/24 con AS_PATH "65003 65002" (asumiendo R2 = AS 65002 por la convención 6500<n>). Probalo en el escenario "Pregunta 4".' },
          ]}
        />
      </Grid2>
      <Grid2>
        <Informe
          items={['ASN, router-id y peer correctos en las dos puntas: instancia y conexión de R1 y de R3.', 'Sesión established: la salida de /routing bgp session print —y lo que viste con una sola punta configurada—.', 'Anuncio de red propia y rutas aprendidas: /ip route print where bgp en R1 y en R3.', 'Conectividad por BGP: ping y traceroute entre lan1 y lan3.', 'Las cuatro preguntas de cierre, con la comparación OSPF / BGP.']}
        />
        <Trouble
          rows={[
            ['Sesión en idle / active', 'falta la conexión del otro lado, o el ASN está mal', 'las dos puntas y que remote.as cruce'],
            ['Sesión OK pero no hay rutas', 'no se anunció la red', 'output.redistribute=connected'],
            ['No hay conectividad al peer', 'falta la IP de backbone', '10.10.10.<n> en /ip address'],
            ['ASN duplicado', 'dos routers con el mismo AS', 'la tabla del paso 1'],
          ]}
        />
      </Grid2>
    </div>
  )
}
