import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Lab from '../components/Lab'
import { Card, Commands, Controls, Grid2, Informe, PageHeader, Questions, ScenarioTabs, Trouble } from '../components/Content'
import { p6PppoeTopology } from '../data/topologies'
import { PppoeSim, type PppoeScenario } from '../sim/pppoe'

export default function P6B() {
  const [scn, setScn] = useState<PppoeScenario>('session')
  const steps = useMemo(() => new PppoeSim(scn).run(scn).steps, [scn])
  return (
    <div>
      <PageHeader
        tag="Práctica 6 · B · Unidad 4 · Acceso"
        title="PPPoE: antes de darte una dirección, decime quién sos"
        subtitle="En la primera mitad el router repartía direcciones a quien estuviera enchufado. Funciona, y para una oficina alcanza. Para un ISP le falta lo único que importa: saber a quién le está dando servicio. PPPoE agrega exactamente eso. Antes de entregar dirección pide usuario y contraseña, y con eso el abonado deja de ser «quien esté enchufado» y pasa a ser una sesión identificada — que se puede medir, limitar y cortar. El plan comercial vive en el perfil y se materializa solo en una cola cada vez que el cliente conecta."
        chips={['vlan-acceso VID 100', 'pool-pppoe 100.64.0.10–100', 'plan-10m / plan-50m', 'abonado1 / secreto1', 'IPCP · no hay DHCP', 'RouterOS 7.20.4']}
      />
      <p className="mb-4 text-sm text-slate-600">
        Mitad B de P6. Viene de{' '}
        <Link to="/p6" className="font-semibold text-teal-800 underline">
          P6·A DHCP e IPoE
        </Link>
        . Si ahí quedó levantado el servidor de IPoE sobre <code>vlan-acceso</code>, <b>dejalo</b> — en el escenario de corte se usa.
      </p>
      <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[15px] leading-relaxed text-slate-800">
        <b>Lo primero, porque confunde a todos:</b> en PPPoE la dirección del abonado <b>no sale de ningún pool DHCP</b>. No hay Discover, no hay lease, no hay <code>dhcp-server</code>. La negocia <b>IPCP</b> adentro de la sesión PPP, <em>después</em> de que el usuario se autenticó.
      </div>
      <Controls>
        <ScenarioTabs
          value={scn}
          onChange={setScn}
          options={[
            { id: 'session', label: 'Sesión abonado1 (plan-10m)' },
            { id: 'vlan-mismatch', label: 'Error: vlan-id distinto' },
            { id: 'change-plan', label: 'Cambio de plan a 50M' },
            { id: 'cut-secret-only', label: 'Cortar: secret, después sesión' },
            { id: 'cut-then-ipoe', label: 'Corte PPPoE + IPoE al lado' },
          ]}
        />
      </Controls>
      <Lab key={scn} topo={p6PppoeTopology()} steps={steps} />
      <Grid2>
        <Card title="Cómo entra en el bloque">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-1">Bloque</th>
                <th>Qué pasa</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-100">
                <td className="py-1.5 pr-2 font-mono whitespace-nowrap">mié 14-oct · 60 min</td>
                <td>Pasos 1–4 · planes, credenciales, la VLAN de acceso, el concentrador y el abonado</td>
              </tr>
              <tr className="border-t border-slate-100">
                <td className="py-1.5 pr-2 font-mono whitespace-nowrap">mié 14-oct · 30 min</td>
                <td>Paso 5 · cortarle el servicio a quien no paga — y por qué a veces no alcanza</td>
              </tr>
            </tbody>
          </table>
          <p className="text-sm">
            Si no hiciste la primera mitad, el armado de las máquinas está en P6·A, pasos 1 a 3. Para PPPoE alcanza con R1 y R2 conectados por la Red Interna <code>acceso</code>, escrita <b>igual</b> en los dos — C1 se puede dejar para después.
          </p>
        </Card>
        <Card title="La misma topología · C1 no se toca">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-1">Nodo</th>
                <th>Adaptador 2</th>
                <th>Adaptador 3</th>
                <th>En esta mitad</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-100 align-top">
                <td className="py-1.5 pr-2 font-mono">R1</td>
                <td>
                  Red Interna <code>acceso</code> → <code>ether2</code>
                </td>
                <td>
                  Red Interna <code>lan1</code> → <code>ether3</code>
                </td>
                <td>
                  concentrador PPPoE sobre <code>vlan-acceso</code>
                </td>
              </tr>
              <tr className="border-t border-slate-100 align-top">
                <td className="py-1.5 pr-2 font-mono">R2</td>
                <td>
                  Red Interna <code>acceso</code> → <code>ether2</code>
                </td>
                <td>—</td>
                <td>
                  disca PPPoE sobre <code>vlan-acceso</code>
                </td>
              </tr>
              <tr className="border-t border-slate-100 align-top">
                <td className="py-1.5 pr-2 font-mono">C1</td>
                <td>
                  Red Interna <code>lan1</code>
                </td>
                <td>—</td>
                <td>no participa</td>
              </tr>
            </tbody>
          </table>
          <p className="text-sm">
            No se arma nada nuevo: el PPPoE usa el cable <code>acceso</code> que ya conecta R1 con R2. C1 y <code>lan1</code> quedan como estaban.
          </p>
        </Card>
      </Grid2>
      <Grid2>
        <Card title="Descubrimiento, LCP, auth, IPCP">
          <ol className="space-y-2">
            <li>
              <b className="text-orange-700">PADI → PADO → PADR → PADS</b> — descubrimiento en capa 2 (EtherType 0x8863). El PADI va en broadcast; el concentrador se anuncia con <code>service-name=isp</code>; PADS entrega un session-id. La guía de laboratorio no detalla estos cuatro mensajes: el simulador los muestra para ver el cable, igual que el DORA de la otra mitad.
            </li>
            <li>
              <b className="text-violet-700">LCP</b> — acuerda el enlace PPP adentro de la sesión (0x8864). La guía no lo nombra.
            </li>
            <li>
              <b className="text-violet-700">Auth</b> — usuario y contraseña contra <code>/ppp secret</code> (<code>abonado1</code> / <code>secreto1</code>). La guía no nombra PAP ni CHAP: nombra el secret, que es el contrato.
            </li>
            <li>
              <b className="text-violet-700">IPCP</b> — <b>quien da la dirección</b>. Sale de <code>pool-pppoe</code> (100.64.0.x), no de un dhcp-server. <code>local-address=100.64.0.1</code> es R1 adentro de cada sesión.
            </li>
          </ol>
          <p className="text-sm">
            La cola <code>&lt;pppoe-abonado1&gt;</code> aparece sola: la creó el <code>rate-limit</code> del perfil al conectar. Cambiale el perfil, cortá la sesión y dejá que reconecte: la cola vuelve con el límite nuevo.
          </p>
        </Card>
        <Card title="Por qué no va sobre ether2 directo">
          <p>
            En una red real el PPPoE del abonado llega <b>etiquetado desde la OLT</b> y atraviesa switches que no saben nada de PPPoE: para ellos es tráfico de la VLAN 100 y nada más. El concentrador <b>no está conectado al abonado</b> — está escuchando en una VLAN por la que le llegan los abonados de toda una zona.
          </p>
          <p className="text-sm">
            Si la VLAN no coincide en las dos puntas, no hay sesión — y ningún log menciona la palabra «VLAN». Es el primer lugar a mirar cuando las credenciales están bien y aun así no levanta.
          </p>
          <p className="text-sm">
            <b>Lo que el laboratorio no puede simular:</b> acá la etiqueta la ponen las dos puntas, porque R2 hace de ONU y de router del abonado al mismo tiempo. En la realidad la pone la ONU y el equipo del cliente ni se entera.
          </p>
        </Card>
      </Grid2>
      <Grid2>
        <Commands
          items={[
            {
              cmd: '/ip pool add name=pool-pppoe ranges=100.64.0.10-100.64.0.100\n\n/ppp profile add name=plan-10m \\\n    local-address=100.64.0.1 \\\n    remote-address=pool-pppoe \\\n    rate-limit=10M/10M\n\n/ppp profile add name=plan-50m \\\n    local-address=100.64.0.1 \\\n    remote-address=pool-pppoe \\\n    rate-limit=50M/50M',
              what: 'El pool de abonados y los dos planes. local-address es R1 adentro de cada sesión; remote-address es el pool del que salen las de los abonados. Ese pool no es un pool DHCP.',
              where: 'R1',
            },
            {
              cmd: '/ppp secret add name=abonado1 password=secreto1 service=pppoe profile=plan-10m\n/ppp secret add name=abonado2 password=secreto2 service=pppoe profile=plan-50m',
              what: 'Las credenciales — que son el contrato. Cada abonado con un plan distinto, para después comparar las dos colas. Si lo deshabilitás, el cliente no entra.',
              where: 'R1',
            },
            {
              cmd: '/interface vlan add name=vlan-acceso interface=ether2 vlan-id=100\n\n/interface pppoe-server server add service-name=isp interface=vlan-acceso disabled=no',
              what: 'Primero la VLAN de acceso sobre el puerto que da a los abonados, y recién después el servidor arriba de ella. Si ya la creaste en la primera mitad, la línea de VLAN no hace falta.',
              where: 'R1',
            },
            {
              cmd: '/interface vlan add name=vlan-acceso interface=ether2 vlan-id=100\n\n/interface pppoe-client add name=wan-pppoe \\\n    interface=vlan-acceso \\\n    user=abonado1 password=secreto1 \\\n    add-default-route=yes \\\n    disabled=no',
              what: 'Del lado del abonado — y la VLAN, otra vez. Si el vlan-id no coincide, no hay sesión.',
              where: 'R2',
            },
            {
              cmd: '/ppp active print\n/ip address print\n/queue simple print',
              what: 'Qué mirar cuando levanta: la sesión, una dirección del pool 100.64.0.x, y la cola dinámica <pppoe-abonado1> que nadie escribió a mano.',
              where: 'R1 y R2',
            },
            {
              cmd: '/ppp secret disable [find name=abonado1]\n/ppp active remove [find name=abonado1]',
              what: 'Cortarle el servicio a quien no paga. Solo el secret no alcanza: la sesión vieja sigue viva. Las dos líneas juntas: se cae y no puede volver.',
              where: 'R1',
            },
            {
              cmd: '/interface pppoe-client disable [find name=wan-pppoe]\n\n/ip dhcp-client add interface=vlan-acceso add-default-route=yes disabled=no',
              what: 'Vuelta de tuerca (demostración, no lleva nota): con IPoE en la misma VLAN, entra igual — 100.64.1.x — y /ppp active print queda vacío.',
              where: 'R2',
            },
          ]}
        />
        <Questions
          items={[
            {
              q: '¿Qué sabe el ISP de un cliente con DHCP que no sabe con PPPoE, y al revés?',
              a: 'Con DHCP/IPoE sabe una MAC (el lease) y no sabe quién es. Con PPPoE sabe el usuario del secret — una sesión identificada, con plan y cola — y puede cortarla. Al revés: PPPoE no ata el servicio a la MAC; el mismo contrato sirve desde otro equipo. La MAC de IPoE no alcanza para facturar ni para un corte que no se eluda cambiando la placa.',
            },
            {
              q: '¿Por qué deshabilitar el /ppp secret no alcanza para cortar el servicio?',
              a: 'La sesión vieja sigue viva y el abonado sigue navegando. Deshabilitar el contrato no desconecta a nadie. Hay que hacer también /ppp active remove. Recién entonces, al rediscar, el concentrador pide credenciales y las suyas ya no valen.',
            },
            {
              q: 'El rate-limit vive en el perfil, no en el abonado. ¿Qué ventaja operativa tiene eso cuando hay 5.000 clientes en tres planes?',
              a: 'El plan es propiedad del perfil. Cambiar una velocidad es tocar un objeto, no cinco mil. Al reconectar, la cola dinámica vuelve con el límite nuevo (escenario «Cambio de plan a 50M»).',
            },
            {
              q: 'Con 91 direcciones en el pool, ¿cuántos abonados podés tener conectados a la vez? ¿Y dados de alta? ¿Por qué no es el mismo número?',
              a: '91 conectados a la vez: pool-pppoe es 100.64.0.10–100.64.0.100 inclusive. Dados de alta, tantos secrets como quieras (acá dos: abonado1 y abonado2). El pool limita sesiones simultáneas; el secret es el contrato, y no todos discan al mismo tiempo.',
            },
            {
              q: 'Acá los abonados viven en la config de R1. ¿Qué problema aparece con varios concentradores, y qué resolvería un servidor RADIUS central?',
              a: 'Cada concentrador tendría su copia de secrets y perfiles: alta, baja, cambio de plan o de clave hay que repetirlos en todas las cajas, y se desincronizan. RADIUS centraliza usuario, contraseña y el perfil que aplica, y todos los concentradores preguntan ahí.',
            },
            {
              q: 'Con IPoE andando en la misma VLAN, deshabilitar el /ppp secret deja de cortarle el servicio al abonado. ¿Qué tendría que tener el IPoE para que el corte funcione?',
              a: 'Lo que el lab muestra: el IPoE sigue repartiendo sin preguntar, así que el corte PPPoE no alcanza — un ISP que ofrece las dos cosas tiene que cortar en las dos (o no ofrecer IPoE abierto en la misma VLAN). La guía dice que la respuesta «tiene nombre» y se vio en la teórica; ese nombre no está en esta mitad de laboratorio.',
            },
          ]}
        />
      </Grid2>
      <Grid2>
        <Informe
          items={[
            'PPPoE: pool, perfiles y secrets correctos, con los dos planes.',
            'Sesión establecida con dirección del pool 100.64.0.x — la salida, no el relato.',
            'La cola dinámica del plan, identificada y explicada: quién la creó y cuándo.',
            'El corte de servicio: el secret deshabilitado, la sesión removida, y la evidencia de que no reconecta.',
            'Las seis preguntas de cierre de esta mitad.',
          ]}
        />
        <Trouble
          rows={[
            ['la sesión PPPoE no levanta', 'credenciales o service-name distintos', 'comparar secret y pppoe-client'],
            ['no levanta, y las credenciales están bien', 'vlan-id distinto en cada punta, o el cliente discando sobre ether2', '/interface vlan print en los dos nodos'],
            ['conecta y se cae a los segundos', 'perfil sin local-address o pool agotado', 'revisar /ppp profile y /ip pool'],
            ['no aparece la cola dinámica', 'el perfil no tiene rate-limit', 'agregarlo y reconectar la sesión'],
            ['el abonado deshabilitado sigue navegando', 'quedó la sesión vieja activa', 'además del secret, /ppp active remove'],
            ['cortado y aun así navega', 'está entrando por el IPoE de la otra mitad', '/ip dhcp-server lease print: ahí está su MAC'],
          ]}
        />
      </Grid2>
      <p className="mt-6 text-sm text-slate-500">
        El informe de P6 es uno solo (esta mitad +{' '}
        <Link to="/p6" className="text-teal-800 underline">
          DHCP e IPoE
        </Link>
        ). Entregable: se sube al campus. La rúbrica con puntaje está al pie de la guía de la Práctica 6; estas mitades traen el checklist, no la tabla de puntos. Después de P6: P7 — NAT de carrier · las direcciones de 100.64.x son las que se traducen.
      </p>
    </div>
  )
}
