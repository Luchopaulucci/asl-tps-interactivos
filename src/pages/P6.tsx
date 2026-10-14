import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Lab from '../components/Lab'
import { Card, Commands, Controls, Grid2, Informe, PageHeader, Questions, ScenarioTabs, Trouble } from '../components/Content'
import { p6Topology, P6_C1_MAC, P6_R2_MAC } from '../data/topologies'
import { DhcpSim, type DhcpScenario } from '../sim/dhcp'

export default function P6() {
  const [scn, setScn] = useState<DhcpScenario>('lan')
  const steps = useMemo(() => {
    const base = p6Topology()
    const r1 = base.devices.find((d) => d.id === 'R1')!
    return new DhcpSim(scn, p6Topology, { c1: P6_C1_MAC, r2: P6_R2_MAC, r1lan: r1.ifaces[1].mac, r1acc: r1.ifaces[0].mac }).run(scn).steps
  }, [scn])
  return (
    <div>
      <PageHeader
        tag="Práctica 6 · A y C · Unidad 4 · Acceso"
        title="DHCP e IPoE: que las direcciones las reparta el router"
        subtitle="En los cinco labs anteriores cada dirección la escribiste a mano, nodo por nodo. Ningún ISP hace eso. Acá R1 las presta solas. Primero en una LAN (oficina). Después el mismo servidor en el segmento de acceso —eso es lo que un ISP llama IPoE— y ahí se ve lo que tiene de bueno y de peligroso: le da dirección a quien esté enchufado, sin preguntar nada. Seguí el DORA: Discover, Offer, Request, Ack."
        chips={['R1 ether2 = acceso (vlan-acceso VID 100)', 'R1 ether3 = lan1', 'pool-dhcp .100–.200', 'pool-ipoe 100.64.1.10–100', 'UDP 67/68', 'RouterOS 7.20.4']}
      />
      <p className="mb-4 text-sm text-slate-600">
        Mitad A de P6 (DHCP e IPoE). La otra mitad:{' '}
        <Link to="/p6b" className="font-semibold text-teal-800 underline">
          P6·B PPPoE
        </Link>{' '}
        — lo que le falta al IPoE es identidad.
      </p>
      <Controls>
        <ScenarioTabs
          value={scn}
          onChange={setScn}
          options={[
            { id: 'lan', label: 'DHCP en lan1 (C1)' },
            { id: 'lan-no-network', label: 'Romperlo: sin el objeto network' },
            { id: 'ipoe', label: 'IPoE en vlan-acceso (R2)' },
            { id: 'ipoe-vlan-mismatch', label: 'Error: vlan-id distinto' },
          ]}
        />
      </Controls>
      <Lab key={scn} topo={p6Topology()} steps={steps} />
      <Grid2>
        <Card title="Cómo se reparte el bloque (90 min)">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-1">Min</th>
                <th>Qué pasa</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-100">
                <td className="py-1.5 pr-2 font-mono">0–20</td>
                <td>Demo: dos VLAN sobre el mismo cable, y el sniffer de P1 (no entra en el informe)</td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="py-1.5 pr-2 font-mono">20–45</td>
                <td>Pasos 1–3 · armado, cableado y verificar las interfaces</td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="py-1.5 pr-2 font-mono">45–75</td>
                <td>
                  Pasos 4–6 · DHCP: servidor, cliente y la prueba del <code>network</code>
                </td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="py-1.5 pr-2 font-mono">75–90</td>
                <td>Pasos 7–9 · IPoE: el mismo servidor sobre la VLAN, y el cliente</td>
              </tr>
            </tbody>
          </table>
          <p className="text-sm">
            <b>Requisito duro:</b> R1 como CHR con adaptador 1 de gestión, 2 al segmento de abonados y 3 a <code>lan1</code>. Más un host que sepa pedir DHCP. Para IPoE hace falta un segundo nodo del otro lado del <code>ether2</code>.
          </p>
        </Card>
        <Card title="Armado · nodos y adaptadores (pasos 1–3)">
          <p className="text-sm">Dos CHR más un cliente. R1 se puede reusar (hay que borrarle lo que traiga). <b>R2 se clona de CHR-base</b>, no de un nodo ya configurado. C1: cualquier host que sepa pedir.</p>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-1">Nodo</th>
                <th>Adaptador 1</th>
                <th>Adaptador 2</th>
                <th>Adaptador 3</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-100">
                <td className="py-1.5 pr-2 font-mono">R1</td>
                <td>gestión</td>
                <td>
                  Red Interna <code>acceso</code>
                </td>
                <td>
                  Red Interna <code>lan1</code>
                </td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="py-1.5 pr-2 font-mono">R2</td>
                <td>gestión</td>
                <td>
                  Red Interna <code>acceso</code>
                </td>
                <td>—</td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="py-1.5 pr-2 font-mono">C1</td>
                <td>gestión</td>
                <td>
                  Red Interna <code>lan1</code>
                </td>
                <td>—</td>
              </tr>
            </tbody>
          </table>
          <p className="text-sm">
            Los dos adaptadores <code>acceso</code> tienen que estar <b>escritos igual</b> en R1 y R2. Gestión en solo-anfitrión (<code>vboxnet0</code>) y sin IP. Adaptador 2 = <code>ether2</code>, adaptador 3 = <code>ether3</code>. En R1, ether2 es el segmento de abonados y ether3 la LAN.
          </p>
        </Card>
      </Grid2>
      <Grid2>
        <Card title="DORA en criollo">
          <ol className="space-y-2">
            <li>
              <b className="text-cyan-700">D · Discover</b> — «¿hay algún servidor DHCP?» El cliente no tiene IP: sale de 0.0.0.0 a 255.255.255.255 (MAC FF:FF:FF:FF:FF:FF), UDP 68 → 67. Lleva un <b>xid</b> que identifica la transacción.
            </li>
            <li>
              <b className="text-cyan-700">O · Offer</b> — «tengo esta: yiaddr=192.168.1.x». El servidor la reserva un rato y manda máscara, gateway (opción 3), DNS (6), lease time (51) y su server id (54).
            </li>
            <li>
              <b className="text-cyan-700">R · Request</b> — «sí, quiero esa». Va otra vez en broadcast (todavía no tiene IP), con la IP pedida (opción 50) y a qué servidor le acepta (54).
            </li>
            <li>
              <b className="text-cyan-700">A · Ack</b> — «es tuya por 30 min». El lease queda <b>bound</b> con la MAC del cliente. El cliente configura IP, ruta por defecto y DNS.
            </li>
          </ol>
          <p className="text-sm">A la mitad del lease (T1) el cliente renueva en <b>unicast</b>: ya sabe quién es el servidor.</p>
        </Card>
        <Card title="Los tres objetos (y el que se olvida)">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-1">Objeto</th>
                <th>Qué aporta</th>
                <th>Si falta</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-100 align-top">
                <td className="py-1.5 pr-2 font-mono text-[13px]">/ip pool</td>
                <td className="pr-2">el rango a prestar</td>
                <td>el servidor no tiene qué dar</td>
              </tr>
              <tr className="border-t border-slate-100 align-top">
                <td className="py-1.5 pr-2 font-mono text-[13px]">/ip dhcp-server network</td>
                <td className="pr-2">gateway, DNS y máscara</td>
                <td>
                  <b>recibe IP y no sale de la LAN</b>
                </td>
              </tr>
              <tr className="border-t border-slate-100 align-top">
                <td className="py-1.5 pr-2 font-mono text-[13px]">/ip dhcp-server</td>
                <td className="pr-2">en qué interfaz escucha</td>
                <td>nadie contesta el Discover</td>
              </tr>
            </tbody>
          </table>
          <p className="text-sm">
            El pool no incluye la dirección del router y arranca en <code>.100</code> a propósito: deja libre el principio del rango para las direcciones fijas.
          </p>
        </Card>
      </Grid2>
      <Grid2>
        <Card title="El mismo servidor, con tres palabras cambiadas">
          <p className="text-sm">
            No es un servidor nuevo: es el del paso 4. Cambian <b>tres cosas</b> y nada más.
          </p>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-1">Qué</th>
                <th>Paso 4 · DHCP de LAN</th>
                <th>Paso 7 · IPoE</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-100 align-top">
                <td className="py-1.5 pr-2 font-mono text-[13px]">interface=</td>
                <td className="pr-2">
                  <code>ether3</code> — un puerto
                </td>
                <td>
                  <code>vlan-acceso</code> — <b>una VLAN</b>
                </td>
              </tr>
              <tr className="border-t border-slate-100 align-top">
                <td className="py-1.5 pr-2">el rango</td>
                <td className="pr-2">
                  <code>192.168.1.0/24</code> — privado
                </td>
                <td>
                  <code>100.64.1.0/24</code> — <b>RFC 6598</b>
                </td>
              </tr>
              <tr className="border-t border-slate-100 align-top">
                <td className="py-1.5 pr-2">el nombre</td>
                <td className="pr-2">
                  <code>dhcp-lan1</code>
                </td>
                <td>
                  <code>dhcp-acceso</code>
                </td>
              </tr>
              <tr className="border-t border-slate-100 align-top">
                <td className="py-1.5 pr-2">quién está del otro lado</td>
                <td className="pr-2">un empleado</td>
                <td>
                  <b>un abonado que paga</b>
                </td>
              </tr>
            </tbody>
          </table>
          <p className="text-sm">
            Las tres primeras filas son configuración. La cuarta no se configura — y es la única que importa. En la LAN, que le dé dirección a cualquiera está bien (el que está adentro ya pasó por la puerta). En el acceso no hay puerta.
          </p>
        </Card>
        <Card title="Por qué sobre una VLAN y no sobre ether2">
          <p>
            En una red real el pedido del abonado llega <b>etiquetado desde la OLT</b> y atraviesa switches que no saben nada de DHCP: para ellos es tráfico de la VLAN 100 y nada más. El servidor <b>no está conectado al abonado</b> — escucha en una VLAN por la que le llegan los abonados de toda una zona.
          </p>
          <p className="text-sm">
            El <code>vlan-id</code> tiene que ser el mismo en las dos puntas. Si no, el cliente no recibe nada y <b>ningún log menciona la palabra «VLAN»</b>.
          </p>
          <p className="text-sm">
            Y el pool no es <code>192.168.x.x</code>. <code>100.64.0.0/10</code> es el espacio compartido de la RFC 6598, el que los ISP reservan para los clientes detrás de un CGNAT. Las direcciones que repartís acá son las que en P7 vas a traducir.
          </p>
        </Card>
      </Grid2>
      <Grid2>
        <Commands
          items={[
            {
              cmd: '/ip address print\n/ip route remove [find dynamic=no]\n/ip address remove [find interface!=ether1]',
              what: 'R1 arranca limpio. Si viene de otra práctica, sacale lo de ayer — si no, vas a estar depurando rutas que no son de esta práctica.',
              where: 'R1',
            },
            {
              cmd: '/interface print',
              what: 'Antes de configurar nada. En R1 tienen que verse tres interfaces (ether1, ether2, ether3). En R2, dos. Si ether3 no está y lo descubrís cuando el cliente no recibe, vas a buscar el problema en el DHCP — que está bien.',
              where: 'R1 y R2',
            },
            {
              cmd: '/ip pool add name=pool-dhcp ranges=192.168.1.100-192.168.1.200\n/ip address add address=192.168.1.1/24 interface=ether3 comment="LAN1 (DHCP)"\n\n/ip dhcp-server network add address=192.168.1.0/24 \\\n    gateway=192.168.1.1 \\\n    dns-server=192.168.1.1\n\n/ip dhcp-server add name=dhcp-lan1 \\\n    interface=ether3 \\\n    address-pool=pool-dhcp \\\n    disabled=no',
              what: 'Los tres objetos en R1. El pool arranca en .100 para dejar libre el principio para IP fijas.',
              where: 'R1',
            },
            {
              cmd: 'udhcpc -i eth1            # Alpine / busybox\ndhclient -v eth0          # Debian y derivados\n\n/ip dhcp-client add interface=ether2 disabled=no    # si C1 es una CHR',
              what: 'Del otro lado no se configura: se pide. El servidor son tres objetos y veinte líneas; el cliente es un comando.',
              where: 'C1',
            },
            {
              cmd: '/ip dhcp-server lease print',
              what: 'En R1: la MAC del cliente con estado bound.',
              where: 'R1',
            },
            {
              cmd: 'ip address show          # la dirección que le tocó\nip route show            # la ruta por defecto\nping 192.168.1.1         # el gateway responde',
              what: 'En C1: recibió una dentro de 192.168.1.100-200 y sale hacia el gateway.',
              where: 'C1',
            },
            {
              cmd: '/ip dhcp-server network disable [find address=192.168.1.0/24]',
              what: 'Rompelo a propósito y renová el lease en C1: recibe IP y máscara, pingea vecinos, no aprende gateway ni DNS. Ninguna pantalla muestra un error. Esa comparación es la evidencia del informe.',
              where: 'R1',
            },
            {
              cmd: '/interface vlan add name=vlan-acceso interface=ether2 vlan-id=100\n\n/ip pool add name=pool-ipoe ranges=100.64.1.10-100.64.1.100\n/ip address add address=100.64.1.1/24 interface=vlan-acceso comment="acceso IPoE"\n\n/ip dhcp-server network add address=100.64.1.0/24 \\\n    gateway=100.64.1.1 \\\n    dns-server=100.64.1.1\n\n/ip dhcp-server add name=dhcp-acceso \\\n    interface=vlan-acceso \\\n    address-pool=pool-ipoe \\\n    disabled=no',
              what: 'IPoE: el mismo servidor, interface=vlan-acceso, rango 100.64.1.0/24, nombre dhcp-acceso.',
              where: 'R1',
            },
            {
              cmd: '/interface vlan add name=vlan-acceso interface=ether2 vlan-id=100\n\n/ip dhcp-client add interface=vlan-acceso add-default-route=yes disabled=no',
              what: 'El abonado pide dirección por la VLAN. Si el vlan-id no coincide, no pasa nada.',
              where: 'R2',
            },
            {
              cmd: '/ip address print\n/ip route print where dst-address=0.0.0.0/0',
              what: 'En R2: 100.64.1.x y ruta por defecto, sin haber entregado credenciales.',
              where: 'R2',
            },
            {
              cmd: '/ip dhcp-server lease print where server=dhcp-acceso',
              what: 'Lo único que el ISP sabe del abonado: su MAC.',
              where: 'R1',
            },
          ]}
        />
        <Questions
          items={[
            {
              q: '¿Por qué hacen falta dos objetos y no uno? ¿Qué le falta al cliente cuando falta el network, y por qué no aparece ningún error?',
              a: 'El pool dice qué direcciones prestar; el network dice con qué parámetros (gateway, DNS y máscara). Sin network el cliente recibe IP y máscara pero no gateway ni DNS: el protocolo funcionó bien, simplemente no hubo opciones 3 y 6. Nada «falló», por eso no hay error. (La guía habla de tres objetos —pool, network, dhcp-server— y esta pregunta se refiere a pool + network.)',
            },
            {
              q: 'El pool arranca en .100. ¿Qué problema aparece el día que arranca en .2?',
              a: 'Choca con las direcciones fijas (el .10 de las otras prácticas, servidores, impresoras): el servidor puede prestar una IP que ya está en uso. Empezar en .100 deja el principio del rango para IP estables. Un pool que empieza en .2 funciona igual hasta el día que hace falta una IP estable.',
            },
            {
              q: '¿Por qué el pool de acceso usa 100.64.0.0/10 y no 192.168.x.x? Relacionalo con el CGNAT de P7.',
              a: 'Es el espacio compartido de la RFC 6598, reservado para clientes de ISP detrás de un CGNAT. No choca con las 192.168 que el abonado usa adentro de su casa, y es lo que en P7 se traduce a la IP pública. El pool de esta mitad es pool-ipoe 100.64.1.10–100 sobre 100.64.1.0/24.',
            },
            {
              q: 'El servidor de IPoE escucha en vlan-acceso y no en ether2. Si mañana hay que sumar una segunda zona por el mismo cable, ¿qué habría que hacer en R1?',
              a: 'Otra interfaz VLAN sobre ether2 con otro vlan-id, con su IP, su pool, su network y su dhcp-server escuchando en esa VLAN. Dos redes viajando por el mismo cable sin escucharse (la demo de los 20 min).',
            },
            {
              q: '¿Qué sabe el ISP de un abonado que entró por IPoE? Mirá la tabla de leases y contestá qué podrías facturarle, y cómo le cortarías el servicio.',
              a: 'Sólo su MAC (la tabla de leases). No hay identidad: no sabés a quién facturar, y cortar sería bloquear una MAC que se puede cambiar. Lo que falta es saber quién entra: la otra mitad de P6 (PPPoE).',
            },
          ]}
        />
      </Grid2>
      <Grid2>
        <Informe
          items={[
            'DHCP: pool, server y network correctos — los tres objetos, en lan1.',
            'Evidencia del lease: /ip dhcp-server lease print con la MAC del cliente en estado bound.',
            'La prueba del network ausente: el cliente con IP y sin salida.',
            'Las cinco preguntas de cierre de esta mitad.',
          ]}
        />
        <Trouble
          rows={[
            ['el cliente DHCP no recibe nada', 'servidor en la interfaz equivocada', 'verificar interface= del dhcp-server'],
            ['recibe IP pero no sale de la LAN', 'falta el objeto dhcp-server network', 'agregar la red con gateway y DNS'],
            ['direcciones fuera de lo esperado', 'pool mal definido o solapado', 'revisar /ip pool print'],
            ['en IPoE el cliente no recibe nada', 'el servidor quedó sobre ether2 y no sobre vlan-acceso, o el vlan-id no coincide', '/interface vlan print en los dos nodos'],
            ['recibe dirección pero la ruta va a cualquier lado', 'quedó otro cliente activo pidiendo por otro lado', '/ip route print muestra las dos por defecto'],
          ]}
        />
      </Grid2>
      <p className="mt-6 text-sm text-slate-500">
        El informe de P6 es uno solo (esta mitad +{' '}
        <Link to="/p6b" className="text-teal-800 underline">
          PPPoE
        </Link>
        ). Entregable: se sube al campus. La rúbrica con puntaje está al pie de la guía de la Práctica 6; estas mitades de laboratorio traen el checklist, no la tabla de puntos.
      </p>
    </div>
  )
}
