import { useMemo, useState } from 'react'
import Lab from '../components/Lab'
import { Card, Commands, Controls, Grid2, Informe, PageHeader, Questions, ScenarioTabs, Trouble } from '../components/Content'
import { p1Topology } from '../data/topologies'
import { cloneState, initialState, simulateArping, simulatePing } from '../sim/net'
import type { Step, Topology } from '../sim/types'

type Scn = 'cliente' | 'router' | 'arping' | 'borrar' | 'mascara'

function build(scn: Scn): { steps: Step[]; topo: Topology } {
  const topo = p1Topology
  const st0 = initialState(topo)
  if (scn === 'cliente') {
    return { topo, steps: simulatePing(topo, st0, { from: 'cliente', to: '192.168.1.1', count: 2, cmd: '/ping 192.168.1.1 count=2   # la guía usa count=4' }).steps }
  }
  if (scn === 'router') {
    return { topo, steps: simulatePing(topo, st0, { from: 'router', to: '192.168.1.10', count: 2, cmd: '/ping 192.168.1.10 count=2   # la guía usa count=4' }).steps }
  }
  if (scn === 'arping') {
    return { topo, steps: simulateArping(topo, st0, 'cliente', 'ether2', '192.168.1.1').steps }
  }
  if (scn === 'borrar') {
    const a = simulatePing(topo, st0, { from: 'cliente', to: '192.168.1.1', count: 1, cmd: '/ping 192.168.1.1 count=2' })
    const st = cloneState(a.state)
    st.arp.cliente = st.arp.cliente.filter((e) => e.ip !== '192.168.1.1')
    const del: Step = {
      title: 'Borrar la entrada ARP',
      text: 'Con el sniffer prendido, el cliente borra 192.168.1.1 de su tabla ARP. Se borra por dirección ([find address=...]) y no por número de fila: el número depende de lo que haya en la tabla en ese momento.',
      cmd: '/ip arp print\n/ip arp remove [find address=192.168.1.1]',
      packets: [],
      tables: [],
      status: 'info',
      highlight: ['cliente'],
    }
    const b = simulatePing(topo, st, { from: 'cliente', to: '192.168.1.1', count: 2, cmd: '/ping 192.168.1.1 count=2' })
    del.tables = b.steps[0].tables.map((t) => (t.id === 'arp-cliente' ? { ...t, rows: [] } : t))
    const last: Step = {
      ...b.steps[b.steps.length - 1],
      text: 'Reapareció el ciclo completo: request, reply y recién después el ICMP. La tabla ARP es una caché —no configuración— y se repuebla sola, por demanda. Por eso el primer ping suele tardar más.',
    }
    return { topo, steps: [...a.steps, del, ...b.steps.slice(0, -1), last] }
  }
  // máscara mal
  const bad: Topology = {
    ...topo,
    devices: topo.devices.map((d) => (d.id === 'cliente' ? { ...d, ifaces: [{ ...d.ifaces[0], prefix: 32 }] } : d)),
  }
  const st = initialState(bad)
  const p = simulatePing(bad, st, { from: 'cliente', to: '192.168.1.1', cmd: '/ping 192.168.1.1 count=4' })
  const ar = simulateArping(bad, p.state, 'cliente', 'ether2', '192.168.1.1')
  const intro: Step = {
    title: 'Error típico: el cliente quedó con /32',
    text: 'Se tipeó 192.168.1.10/32 en vez de /24. Con /32, la única red conectada del cliente es él mismo: 192.168.1.1 no está "en su LAN". Mirá la tabla de ruteo del cliente.',
    cmd: '/ip address add address=192.168.1.10/32 interface=ether2 comment="cliente LAN1"',
    packets: [],
    tables: p.steps[0].tables,
    status: 'info',
    highlight: ['cliente'],
  }
  const end: Step = {
    title: 'Diagnóstico: arping anda, ping no → capa 3',
    text: 'arping sólo necesita el dominio de broadcast, y responde. ping necesita que el direccionamiento esté bien. Si arping anda y ping no, el cable (lan1) está bien y el problema es de capa 3: máscara o subred. Se arregla en /ip address.',
    cmd: '/ip address print',
    packets: [],
    tables: ar.steps[ar.steps.length - 1].tables,
    status: 'info',
  }
  return { topo: bad, steps: [intro, ...p.steps, ...ar.steps, end] }
}

export default function P1() {
  const [scn, setScn] = useState<Scn>('cliente')
  const { steps, topo } = useMemo(() => build(scn), [scn])
  return (
    <div>
      <PageHeader
        tag="Práctica 1 · Unidad 1 · Fundamentos L2/L3"
        title="LAN base: capa 2 y capa 3 sobre el mismo cable"
        subtitle="Dos CHR en la Red Interna lan1. Para hablarle a una IP de tu misma LAN, primero hay que averiguar su MAC: ARP resuelve IP → MAC y lo cachea. Acá lo ves pasar: primero el ARP, recién después el ping."
        chips={['Cliente-Virtual 192.168.1.10/24 · ether2', 'Router-Borde 192.168.1.1/24 · ether2', 'ether1 = gestión (sin IP)']}
      />
      <Controls>
        <ScenarioTabs
          value={scn}
          onChange={setScn}
          options={[
            { id: 'cliente', label: 'Ping desde el Cliente' },
            { id: 'router', label: 'Ping desde el Router' },
            { id: 'arping', label: 'arping (capa 2)' },
            { id: 'borrar', label: 'Borrar la entrada ARP y repetir' },
            { id: 'mascara', label: 'Error: máscara /32' },
          ]}
        />
      </Controls>
      <Lab key={scn} topo={topo} steps={steps} sniffNodes={[{ id: 'cliente', label: 'Cliente-Virtual (ether2)' }, { id: 'router', label: 'Router-Borde (ether2)' }]} />
      <Grid2>
        <Card title="Lo que tenés que ver (y por qué)">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li><b>ARP request</b> · capa 2 · destino FF:FF:FF:FF:FF:FF: "¿quién tiene .1?". No le podés preguntar a alguien que todavía no sabés identificar, así que se le pregunta al segmento entero.</li>
            <li><b>ARP reply</b> · sólo responde el dueño, directo a la MAC del que preguntó: "soy yo, esta es mi MAC".</li>
            <li><b>ICMP echo request</b> · recién ahora sale el ping: ya sabe a qué MAC entregarlo.</li>
            <li><b>ICMP echo reply</b> · sin ARP de nuevo: el router ya cacheó al cliente cuando recibió el request.</li>
          </ol>
          <p className="text-sm">En el sniffer las dos primeras son protocolo <b>2054</b> (ARP) y no tienen IP; las dos últimas son <b>2048</b> (IPv4). Ojo en WinBox: hay que agregar las columnas de MAC con el ícono ≡, y no todo broadcast es ARP (MNDP puerto 5678, LLDP, CDP).</p>
        </Card>
        <Card title="ping vs arping">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr><th></th><th className="py-1">ping</th><th className="py-1">arping</th></tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-100"><td className="py-1.5 pr-2 font-medium">Capa</td><td>3 — ICMP</td><td>2 — ARP</td></tr>
              <tr className="border-t border-slate-100"><td className="py-1.5 pr-2 font-medium">Pregunta</td><td>"¿Me respondés, IP 192.168.1.1?"</td><td>"¿Quién tiene 192.168.1.1? Decime tu MAC."</td></tr>
              <tr className="border-t border-slate-100"><td className="py-1.5 pr-2 font-medium">Depende de</td><td>direccionamiento IP (máscara, subred) + cable</td><td>sólo el dominio de broadcast</td></tr>
              <tr className="border-t border-slate-100"><td className="py-1.5 pr-2 font-medium">Diagnóstico</td><td colSpan={2}>arping OK y ping no → capa 3. arping tampoco → mirá el nombre lan1 en las dos VMs.</td></tr>
            </tbody>
          </table>
        </Card>
      </Grid2>
      <Grid2>
        <Commands
          items={[
            { cmd: '/system identity set name=Router-Borde', what: 'Le pone nombre al router: no confundir ventanas con varios nodos prendidos.' },
            { cmd: '/ip address add address=192.168.1.1/24 interface=ether2 comment="gateway LAN1"', what: 'Direcciona el router en lan1 (ether2). En el cliente: 192.168.1.10/24.', where: 'Router-Borde' },
            { cmd: '/ip address print\n/interface print', what: 'Verifica qué IP quedó en qué interfaz. ether1 (gestión) va sin IP.' },
            { cmd: '/ping 192.168.1.1 count=4', what: 'Prueba capa 3 (ICMP). El primero dispara ARP si la MAC no está cacheada.', where: 'Cliente' },
            { cmd: '/tool arping interface=ether2 address=192.168.1.1', what: 'Prueba capa 2: manda ARP request directo y muestra la MAC que responde.', where: 'Cliente' },
            { cmd: '/ip arp print', what: 'Muestra la caché IP ↔ MAC. Se llena por demanda.' },
            { cmd: '/ip arp remove [find address=192.168.1.1]', what: 'Borra una entrada por dirección (no por número de fila) para ver el ciclo ARP otra vez.' },
            { cmd: 'Tools → Packet Sniffer → ether2 → Start', what: 'Captura las tramas de lan1. Filter → MAC Protocol = arp para encontrarlas.' },
          ]}
        />
        <div className="space-y-4">
          <Questions
            items={[
              { q: '¿Por qué el primer ping a veces tarda más que los siguientes?', a: 'Porque antes del primer echo request hay que resolver la MAC con ARP (request + reply). Los siguientes usan la caché. Mirá en el escenario "Ping desde el Cliente": el segundo echo no tiene ARP.' },
              { q: '¿Qué diferencia hay entre lo que prueba ping y lo que prueba arping?', a: 'ping prueba capa 3 (ICMP): necesita direccionamiento IP correcto. arping prueba capa 2: sólo necesita compartir el dominio de broadcast. Ver el escenario "Error: máscara /32".' },
              { q: 'En el sniffer, ¿qué MAC aparece como origen del ARP request y por qué el destino es broadcast?', a: 'La MAC de la interfaz del que pregunta (en el ejemplo, 08:00:27:A1:B2:C3 del cliente). El destino es FF:FF:FF:FF:FF:FF porque justamente no sabe la MAC del dueño de la IP: le pregunta a todo el segmento y responde sólo el dueño.' },
              { q: 'Si borrás la entrada ARP y volvés a pinguear, ¿qué observás en el sniffer?', a: 'Reaparece el ciclo completo: ARP request, ARP reply y después ICMP. Demuestra que la tabla ARP es una caché que se repuebla sola.' },
            ]}
          />
        </div>
      </Grid2>
      <Grid2>
        <Informe
          items={['Direccionamiento de los dos nodos, documentado con su comment=.', 'Evidencia de ping con 0% de pérdida y de arping respondiendo con la MAC.', '/ip arp print de los dos nodos, con la explicación de qué cachea cada uno.', 'Captura del sniffer con el ARP y el ICMP identificados.', 'Las cuatro preguntas de cierre respondidas.']}
          rubric={[['Direccionamiento correcto y documentado', 20], ['Ping y arping exitosos (evidencia)', 20], ['Tabla ARP correcta y explicada', 20], ['Captura de sniffer con ARP + ICMP identificados', 20], ['Respuestas a preguntas de cierre', 20]]}
        />
        <Trouble
          rows={[
            ['ping da timeout', 'IPs en distinta subred o máscara mal', '/ip address print'],
            ['ping falla pero arping anda', 'problema de capa 3, no de L2', 'revisar máscara/red'],
            ['arping falla', 'adaptadores en distinta red interna', 'que ambos estén en lan1'],
            ['no aparece nada en el sniffer', 'capturaste la interfaz de gestión', 'seleccionar ether2'],
            ['timeout y "las IP están bien"', 'la dirección quedó en la interfaz de gestión', '/interface print · /ip address print'],
          ]}
        />
      </Grid2>
    </div>
  )
}
