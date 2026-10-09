import { Card, Commands, Grid2, Informe, PageHeader, Questions, Trouble } from '../components/Content'
import StaticRoutingLab from '../components/StaticRoutingLab'
import { p2Presets } from '../data/staticRoutes'
import { p2Topology } from '../data/topologies'

export default function P2() {
  return (
    <div>
      <PageHeader
        tag="Práctica 2 · Unidad 2 · Ruteo estático"
        title="Cadena de routers: cada ruta escrita a mano"
        subtitle="Cuatro routers en línea (R1–R4), cada uno con su LAN. Un router sólo conoce sus redes conectadas: para llegar a una remota hay que decirle a qué vecino (next-hop) entregarle el paquete. Elegí las rutas, el origen y el destino, y seguí el paquete salto a salto."
        chips={['net-1-2 10.10.10.0/24', 'net-2-3 10.10.11.0/24', 'net-3-4 10.10.12.0/24', 'LAN extremos: ether3', 'LAN intermedios: ether4']}
      />
      <StaticRoutingLab topo={p2Topology} presets={p2Presets} defaultPreset="full" failable={['R2', 'R3']} />
      <Grid2>
        <Card title="Qué mirar en cada salto">
          <ul className="list-disc space-y-1.5 pl-5">
            <li><b>La IP origen y destino no cambian</b> en todo el camino (abrí el inspector en cada salto).</li>
            <li><b>Las MAC se reescriben en cada salto</b>: origen = la interfaz por la que sale, destino = la del próximo salto (resuelta con ARP en ese enlace).</li>
            <li><b>El TTL baja 1</b> en cada router (64 → 63 → …). Es lo que usa traceroute.</li>
            <li>Cada router decide <b>sólo el próximo salto</b>, mirando su propia tabla con prefijo más largo.</li>
            <li>El ping es pregunta <b>y</b> respuesta: probá "Sólo las rutas de ida" y fijate dónde muere la vuelta.</li>
            <li>traceroute de cliente a cliente: 4 routers + destino = <b>5 líneas</b>. A 192.168.4.1 da una línea menos: R4 es el destino.</li>
          </ul>
        </Card>
        <Card title="La trampa de las interfaces">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500"><tr><th className="py-1">Nodo</th><th>Adapt. 2</th><th>Adapt. 3</th><th>Adapt. 4</th></tr></thead>
            <tbody className="font-mono text-[13px]">
              <tr className="border-t border-slate-100"><td className="py-1">R1</td><td>net-1-2</td><td>lan1</td><td>—</td></tr>
              <tr className="border-t border-slate-100"><td className="py-1">R2</td><td>net-1-2</td><td>net-2-3</td><td>lan2</td></tr>
              <tr className="border-t border-slate-100"><td className="py-1">R3</td><td>net-2-3</td><td>net-3-4</td><td>lan3</td></tr>
              <tr className="border-t border-slate-100"><td className="py-1">R4</td><td>net-3-4</td><td>lan4</td><td>—</td></tr>
            </tbody>
          </table>
          <p className="text-sm">Adaptador 1 = gestión (ether1, sin IP). En los extremos la LAN es <b>ether3</b>; en los intermedios, <b>ether4</b>. El número sale del orden de los adaptadores: corré <code>/interface print</code> en los cuatro. Antes de nada, <code>/ip neighbor print</code>: cada router tiene que ver exactamente a sus vecinos de cadena.</p>
        </Card>
      </Grid2>
      <Grid2>
        <Commands
          items={[
            { cmd: '/ip neighbor print', what: 'Verifica el cableado en capa 2: R1 ve a R2; R2 a R1 y R3; etc. Si no se ven, es el nombre de la Red Interna.' },
            { cmd: '/ip address add address=10.10.10.2/24 interface=ether2 comment="net-1-2"\n/ip address add address=10.10.11.2/24 interface=ether3 comment="net-2-3"\n/ip address add address=192.168.2.1/24 interface=ether4 comment="LAN2"', what: 'Direccionamiento de un intermedio (R2). El último octeto = número de nodo.', where: 'R2' },
            { cmd: '/ip route add dst-address=<red destino> gateway=<IP del vecino> comment="<qué es>"', what: 'Ruta estática: red destino + vecino al que se le entrega. El gateway tiene que ser alcanzable por una interfaz tuya.' },
            { cmd: '/ip route add dst-address=0.0.0.0/0 gateway=192.168.1.1 comment="default a R1"', what: 'Default gateway de un Cliente Virtual (paso opcional).', where: 'Cliente-1' },
            { cmd: '/ip route print', what: 'Lista la tabla: DAc = conectadas, As = estáticas activas.' },
            { cmd: '/ping 192.168.4.1 count=4\n/tool traceroute 192.168.4.10', what: 'Verificación extremo a extremo. traceroute dice hasta dónde llega: "muere en R3" es un diagnóstico.' },
            { cmd: '/ip arp print', what: 'En cada enlace, cada router cachea sólo a su vecino directo.' },
          ]}
        />
        <Questions
          items={[
            { q: '¿Por qué los nodos intermedios no pueden usar una sola ruta por defecto?', a: 'Porque tienen redes remotas de los dos lados. Una default manda todo hacia un solo vecino: lo que está del otro lado quedaría inalcanzable (o daría vueltas). Los extremos sí pueden: tienen una sola salida.' },
            { q: 'Mostrá la salida de traceroute y explicá cada salto.', a: 'De Cliente-1 a 192.168.4.10: 192.168.1.1 (R1, por donde entró), 10.10.10.2 (R2), 10.10.11.3 (R3), 10.10.12.4 (R4) y 192.168.4.10. Cada línea muestra la IP de la interfaz por la que entró el paquete a ese router: la convención del último octeto te dice qué router es.' },
            { q: '¿Qué pasa si un nodo intermedio se apaga? ¿Qué redes quedan inalcanzables?', a: 'Probalo con "Apagar un router": si cae R3, desde la LAN 1 quedan inalcanzables lan3, lan4, net-3-4 (y la interfaz de R3 en net-2-3). Las rutas estáticas siguen apuntando al router muerto: nadie las corrige.' },
            { q: '¿Cuántas rutas estáticas hicieron falta? ¿Cómo escala con 20 nodos?', a: 'Con defaults en los extremos: 1 + 4 + 4 + 1 = 10 (sin defaults, 18). Crece con la cantidad de redes por cada router: con 20 nodos son cientos de líneas, y cada alta obliga a tocar a los demás. Motivación para P4 (OSPF).' },
          ]}
        />
      </Grid2>
      <Grid2>
        <Informe
          items={['Enlaces y direccionamiento correctos, con comment=.', 'Rutas estáticas completas y comentadas, nodo por nodo.', 'Evidencia de ping y traceroute extremo a extremo.', 'Análisis de la tabla de ruteo: qué aparece y por qué.', 'Las cuatro preguntas de cierre respondidas.']}
          rubric={[['Enlaces y direccionamiento correctos', 20], ['Rutas estáticas completas y comentadas', 25], ['Ping y traceroute extremo a extremo (evidencia)', 25], ['Análisis de tabla de ruteo', 15], ['Preguntas de cierre', 15]]}
        />
        <Trouble
          rows={[
            ['Ping al vecino directo OK, al lejano falla', 'falta la ruta de retorno', 'las rutas en los dos sentidos'],
            ['El traceroute muere en un salto', 'ese nodo no sabe rutear de vuelta', 'la tabla del nodo donde muere'],
            ['Funciona la ida y no la vuelta', 'asimetría de rutas', 'el destino necesita ruta hacia tu LAN'],
            ['El cliente no sale de su LAN', 'le falta el default gateway', 'paso 8'],
            ['Nada anda y las rutas "están bien"', 'la IP quedó en la interfaz equivocada', '/interface print'],
          ]}
        />
      </Grid2>
    </div>
  )
}
