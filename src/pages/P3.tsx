import { Card, Commands, Grid2, Informe, PageHeader, Questions, Trouble } from '../components/Content'
import ScaleWidget from '../components/ScaleWidget'
import StaticRoutingLab from '../components/StaticRoutingLab'
import { p3Presets } from '../data/staticRoutes'
import { p3Topology } from '../data/topologies'

export default function P3() {
  return (
    <div>
      <PageHeader
        tag="Práctica 3 · Unidad 2 · Ruteo estático"
        title="Estrella / backbone: todos vecinos, y las rutas siguen a mano"
        subtitle="Los mismos cuatro routers, ahora en un solo segmento compartido (Red Interna «backbone», 10.10.10.0/24). Cualquiera alcanza a cualquiera en un salto, pero cada uno sigue necesitando una ruta por cada LAN remota. La pregunta no es si anda: es cuánto cuesta."
        chips={['backbone 10.10.10.<n>/24 · ether2', 'LAN 192.168.<n>.1/24 · ether3', 'gateway = IP de backbone del dueño', 'N×(N−1) = 12']}
      />
      <StaticRoutingLab topo={p3Topology} presets={p3Presets} defaultPreset="full" failable={['R4']} />
      <Grid2>
        <Card title="Qué cambia respecto de P2">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Todos los nodos son iguales: <b>ether2 = backbone, ether3 = LAN</b>. La trampa de P2 desaparece.</li>
            <li><code>/ip neighbor print</code> en cualquiera muestra a los otros tres sin configurar nada: eso es un backbone.</li>
            <li>Un ARP request en el backbone le llega a <b>los cuatro</b> routers (mirá la animación): todos comparten el dominio de broadcast. ARP se llena por demanda: para tener los tres vecinos en la evidencia, pingueá los tres 10.10.10.&lt;n&gt; antes de <code>/ip arp print</code>.</li>
            <li>traceroute de cliente a cliente: <b>3 líneas</b> (2 routers + destino), contra 5 en la cadena. La topología fija el diámetro, no la configuración.</li>
            <li>El gateway para la LAN de R4 es <b>10.10.10.4</b>. 192.168.4.1 no puede funcionar nunca: no está en ninguna red conectada de R1 (probá el preset con ese error).</li>
          </ul>
        </Card>
        <ScaleWidget />
      </Grid2>
      <Grid2>
        <Commands
          items={[
            { cmd: '/ip route remove [find dynamic=no]\n/ip address remove [find interface!=ether1]', what: 'Paso 0: borrar lo de P2 en los cuatro. dynamic=no = lo que escribiste vos; se excluye ether1 (gestión) para no quedarte afuera.' },
            { cmd: '/ip address add address=10.10.10.1/24 interface=ether2 comment="backbone"\n/ip address add address=192.168.1.1/24 interface=ether3 comment="LAN1"', what: 'Direccionamiento: la misma forma en los cuatro, cambia el <n>.', where: 'R1' },
            { cmd: '/ip neighbor print', what: 'Cada uno tiene que ver a los otros tres. Si falta uno: nombre de Red Interna del adaptador 2.' },
            { cmd: '/ip route add dst-address=192.168.4.0/24 gateway=10.10.10.4 comment="LAN R4"', what: 'Una por cada LAN que no sea la propia: 3 por router, 12 en total.', where: 'R1' },
            { cmd: '/ping 192.168.4.10 count=4\n/tool traceroute 192.168.4.10\n/ip route print\n/ip arp print', what: 'Verificación de cliente a cliente: 2 saltos intermedios, 3 líneas.' },
          ]}
        />
        <Questions
          items={[
            { q: '¿Cuántos saltos hay entre dos LAN en la estrella y cuántos en la cadena de P2? ¿Por qué?', a: 'Estrella: 2 routers intermedios (el de la LAN origen y el de la destino), 3 líneas de traceroute. Cadena: hasta 4 routers, 5 líneas. En el backbone todos comparten el segmento, así que cualquier router está a un salto de cualquier otro.' },
            { q: 'Con 4 routers, ¿cuántas rutas estáticas carga cada uno? ¿Y si fueran 20?', a: 'N−1 = 3 por router, 12 en total. Con 20: 19 por router y 380 en total (N×(N−1)).' },
            { q: '¿Qué pasa cuando agregás un router nuevo al backbone? ¿Quiénes tienen que actualizar su configuración?', a: 'El nuevo necesita N rutas y además los N anteriores tienen que agregar una ruta hacia la LAN nueva: hay que tocar todos los routers.' },
            { q: 'Argumentá por qué esto no escala y qué resolvería un protocolo dinámico.', a: 'Crece cuadrático y cada cambio (alta, baja, caída) exige editar a mano a todos. Un protocolo dinámico (P4, OSPF) hace que cada router anuncie lo suyo y aprenda lo de los demás, y reaccione solo ante una caída.' },
          ]}
        />
      </Grid2>
      <Grid2>
        <Informe
          items={['Conexión al backbone de los cuatro routers: direccionamiento con comment= y la evidencia de /ip neighbor print.', 'Rutas estáticas a todas las LAN remotas, nodo por nodo.', 'Ping y traceroute de cliente a cliente, con los 2 saltos identificados.', 'Análisis de escalabilidad: el conteo de rutas y las cuatro preguntas de cierre.']}
          rubric={[['Conexión al backbone correcta (4 routers)', 20], ['Rutas estáticas a todas las LAN remotas', 30], ['Ping y traceroute (evidencia, 2 saltos)', 25], ['Análisis de escalabilidad (preguntas)', 25]]}
        />
        <Trouble
          rows={[
            ['Falta un nodo en /ip neighbor print', 'el adaptador 2 no está en la Red Interna backbone', 'el nombre exacto en VirtualBox'],
            ['Ping al backbone OK, a las LAN no', 'faltan las rutas estáticas', '/ip route print'],
            ['Andan algunas LAN y otras no', 'faltan rutas en los dos sentidos', 'la tabla del nodo destino'],
            ['Andan cosas que no configuraste', 'quedó configuración de P2 viva', 'paso 0, en los cuatro'],
            ['El traceroute da más de 2 saltos', 'el gateway apunta a un router que no es el de esa LAN', 'el gateway de cada ruta'],
            ['Respuestas raras en el backbone', 'dos nodos con la misma IP', '/ip address print'],
            ['Una LAN no anda y su router "tiene la IP"', 'en R2/R3 quedó la IP vieja del enlace en ether3', '/ip address print'],
          ]}
        />
      </Grid2>
    </div>
  )
}
