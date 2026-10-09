import { useMemo, useState } from 'react'
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
        tag="Práctica 6 (A y C) · Unidad 4 · Acceso"
        title="DHCP e IPoE: que las direcciones las reparta el router"
        subtitle="En los cinco labs anteriores cada dirección la escribiste a mano. Acá R1 las presta solas: primero en lan1 (oficina) y después el mismo servidor sobre la VLAN de acceso (IPoE), donde le da dirección a quien esté enchufado sin preguntar nada. Seguí el DORA: Discover, Offer, Request, Ack."
        chips={['R1 ether2 = acceso (vlan-acceso VID 100)', 'R1 ether3 = lan1', 'pool-dhcp .100–.200', 'pool-ipoe 100.64.1.10–100', 'UDP 67/68']}
      />
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
        <Card title="DORA en criollo">
          <ol className="space-y-2">
            <li><b className="text-cyan-700">D · Discover</b> — "¿hay algún servidor DHCP?" El cliente no tiene IP: sale de 0.0.0.0 a 255.255.255.255 (MAC FF:FF:FF:FF:FF:FF), UDP 68 → 67. Lleva un <b>xid</b> que identifica la transacción.</li>
            <li><b className="text-cyan-700">O · Offer</b> — "tengo esta: yiaddr=192.168.1.x". El servidor la reserva un rato y manda máscara, gateway (opción 3), DNS (6), lease time (51) y su server id (54).</li>
            <li><b className="text-cyan-700">R · Request</b> — "sí, quiero esa". Va otra vez en broadcast (todavía no tiene IP), con la IP pedida (opción 50) y a qué servidor le acepta (54).</li>
            <li><b className="text-cyan-700">A · Ack</b> — "es tuya por 30 min". El lease queda <b>bound</b> con la MAC del cliente. El cliente configura IP, ruta por defecto y DNS.</li>
          </ol>
          <p className="text-sm">A la mitad del lease (T1) el cliente renueva en <b>unicast</b>: ya sabe quién es el servidor.</p>
        </Card>
        <Card title="Los tres objetos (y el que se olvida)">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500"><tr><th className="py-1">Objeto</th><th>Qué aporta</th><th>Si falta</th></tr></thead>
            <tbody>
              <tr className="border-t border-slate-100 align-top"><td className="py-1.5 pr-2 font-mono text-[13px]">/ip pool</td><td className="pr-2">el rango a prestar</td><td>el servidor no tiene qué dar</td></tr>
              <tr className="border-t border-slate-100 align-top"><td className="py-1.5 pr-2 font-mono text-[13px]">/ip dhcp-server network</td><td className="pr-2">gateway, DNS y máscara</td><td>recibe IP y no sale de la LAN</td></tr>
              <tr className="border-t border-slate-100 align-top"><td className="py-1.5 pr-2 font-mono text-[13px]">/ip dhcp-server</td><td className="pr-2">en qué interfaz escucha</td><td>nadie contesta el Discover</td></tr>
            </tbody>
          </table>
          <p className="text-sm"><b>IPoE</b> es el mismo servidor con tres cosas cambiadas: <code>interface=vlan-acceso</code>, el rango 100.64.1.0/24 (RFC 6598, lo que P7 traduce con CGNAT) y el nombre <code>dhcp-acceso</code>. La cuarta diferencia no se configura: del otro lado hay un abonado que paga. En la LAN, darle IP a cualquiera está bien; en el acceso es un problema: el único dato que el ISP tiene es la MAC.</p>
        </Card>
      </Grid2>
      <Grid2>
        <Commands
          items={[
            { cmd: '/ip pool add name=pool-dhcp ranges=192.168.1.100-192.168.1.200', what: 'El rango. Arranca en .100 para dejar libre el principio para IP fijas (.10 de las otras prácticas).', where: 'R1' },
            { cmd: '/ip address add address=192.168.1.1/24 interface=ether3 comment="LAN1 (DHCP)"', what: 'La IP del router en lan1 (ether3).', where: 'R1' },
            { cmd: '/ip dhcp-server network add address=192.168.1.0/24 \\\n    gateway=192.168.1.1 dns-server=192.168.1.1', what: 'Lo que el cliente aprende además de la IP: gateway y DNS.', where: 'R1' },
            { cmd: '/ip dhcp-server add name=dhcp-lan1 interface=ether3 \\\n    address-pool=pool-dhcp disabled=no', what: 'El servidor: en qué interfaz escucha y de qué pool presta.', where: 'R1' },
            { cmd: '/ip dhcp-client add interface=ether2 disabled=no\nudhcpc -i eth1     # Alpine\ndhclient -v eth0   # Debian', what: 'El cliente no se configura: pide. Un comando contra veinte líneas del servidor.', where: 'C1' },
            { cmd: '/ip dhcp-server lease print', what: 'La MAC del cliente con estado bound.', where: 'R1' },
            { cmd: '/ip dhcp-server network disable [find address=192.168.1.0/24]', what: 'Romperlo a propósito: "tengo IP pero no tengo internet".', where: 'R1' },
            { cmd: '/interface vlan add name=vlan-acceso interface=ether2 vlan-id=100', what: 'La VLAN de acceso. Va en las dos puntas, con el mismo vlan-id.', where: 'R1 y R2' },
            { cmd: '/ip dhcp-client add interface=vlan-acceso add-default-route=yes disabled=no', what: 'El abonado pide dirección por la VLAN.', where: 'R2' },
            { cmd: '/ip dhcp-server lease print where server=dhcp-acceso', what: 'Lo único que el ISP sabe del abonado: su MAC.', where: 'R1' },
          ]}
        />
        <Questions
          items={[
            { q: '¿Por qué hacen falta dos objetos y no uno? ¿Qué le falta al cliente cuando falta el network, y por qué no aparece ningún error?', a: 'El pool dice qué direcciones prestar; el network dice con qué parámetros (gateway, DNS). Sin network el cliente recibe IP y máscara pero no gateway ni DNS: el protocolo funcionó bien, simplemente no hubo opciones 3 y 6. Nada "falló", por eso no hay error.' },
            { q: 'El pool arranca en .100. ¿Qué problema aparece el día que arranca en .2?', a: 'Choca con las direcciones fijas (el .10 de las otras prácticas, servidores, impresoras): el servidor puede prestar una IP que ya está en uso → conflictos. Empezar en .100 deja el principio del rango para IP estables.' },
            { q: '¿Por qué el pool de acceso usa 100.64.0.0/10 y no 192.168.x.x? Relacionalo con el CGNAT de P7.', a: 'Es el espacio compartido de la RFC 6598, reservado para clientes de ISP detrás de un CGNAT. No choca con las 192.168 que el abonado usa adentro de su casa, y es lo que en P7 se traduce a la IP pública.' },
            { q: 'El servidor de IPoE escucha en vlan-acceso y no en ether2. Si hay que sumar una segunda zona por el mismo cable, ¿qué habría que hacer en R1?', a: 'Otra interfaz VLAN sobre ether2 con otro vlan-id, con su IP, su pool, su network y su dhcp-server escuchando en esa VLAN. Dos redes viajando por el mismo cable sin escucharse.' },
            { q: '¿Qué sabe el ISP de un abonado que entró por IPoE? ¿Qué podrías facturarle y cómo le cortarías el servicio?', a: 'Sólo su MAC (mirá la tabla de leases). No hay identidad: no sabés a quién facturar, y cortar sería bloquear una MAC que se puede cambiar. Lo que falta es saber quién entra: la otra mitad de P6 (PPPoE).' },
          ]}
        />
      </Grid2>
      <Grid2>
        <Informe
          items={['DHCP: pool, server y network correctos — los tres objetos, en lan1.', 'Evidencia del lease: /ip dhcp-server lease print con la MAC del cliente en estado bound.', 'La prueba del network ausente: el cliente con IP y sin salida.', 'Las cinco preguntas de cierre de esta mitad.']}
        />
        <Trouble
          rows={[
            ['El cliente DHCP no recibe nada', 'servidor en la interfaz equivocada', 'interface= del dhcp-server'],
            ['Recibe IP pero no sale de la LAN', 'falta el objeto dhcp-server network', 'agregar la red con gateway y DNS'],
            ['Direcciones fuera de lo esperado', 'pool mal definido o solapado', '/ip pool print'],
            ['En IPoE no recibe nada', 'servidor sobre ether2 y no sobre vlan-acceso, o vlan-id distinto', '/interface vlan print en los dos'],
            ['La ruta por defecto va a cualquier lado', 'otro cliente DHCP activo por otro lado', '/ip route print (dos default)'],
          ]}
        />
      </Grid2>
    </div>
  )
}
