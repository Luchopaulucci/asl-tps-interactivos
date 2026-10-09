import { useState } from 'react'
import { Card, Grid2, PageHeader } from '../components/Content'

function CableWidget() {
  const [a, setA] = useState('lan1')
  const [b, setB] = useState('LAN1')
  const ok = a === b && a.length > 0
  return (
    <Card title="Probalo: el «cable» es un nombre">
      <p>Dos VMs se ven en capa 2 sólo si sus adaptadores están en Red Interna con <b>exactamente</b> el mismo nombre. Cambiá los nombres:</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <label className="rounded-xl border border-slate-200 p-3">
          <div className="text-sm font-semibold">Router-Borde · adaptador 2</div>
          <input value={a} onChange={(e) => setA(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 font-mono" />
        </label>
        <div className={`text-center text-3xl ${ok ? 'text-green-600' : 'text-red-500'}`}>{ok ? '⟷' : '✕'}</div>
        <label className="rounded-xl border border-slate-200 p-3">
          <div className="text-sm font-semibold">Cliente-Virtual · adaptador 2</div>
          <input value={b} onChange={(e) => setB(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 font-mono" />
        </label>
      </div>
      <p className={`rounded-lg p-2 text-sm ${ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
        {ok
          ? `Mismo segmento «${a}»: arping y /ip neighbor print se ven. Recién ahora tiene sentido poner IPs.`
          : `«${a}» y «${b}» son dos switches virtuales distintos: los nodos no se ven nunca, y no hay dirección IP que lo arregle. Es el error más común de todo el curso.`}
      </p>
    </Card>
  )
}

export default function Guia0() {
  return (
    <div>
      <PageHeader
        tag="Guía 0"
        title="Convenciones y armado del entorno"
        subtitle="Cada alumno arma toda la topología dentro de su propio VirtualBox, con CHR (RouterOS 7.20.4) y Red Interna. Ecosistema propio y offline: el direccionamiento es fijo e igual para todos porque no hay colisiones posibles."
        chips={['MikroTik CHR 7.20.4', 'VirtualBox · Red Interna', '256 MB por CHR', '4–6 routers simultáneos']}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Plan de direccionamiento (fijo)">
          <table className="w-full text-sm">
            <tbody>
              {[
                ['LAN de R<n>', '192.168.<n>.0/24', 'R1 → 192.168.1.0/24'],
                ['Gateway (el router)', '192.168.<n>.1/24', ''],
                ['Host/cliente', '192.168.<n>.10/24', 'CHR en rol de cliente'],
                ['Backbone (P3, P4, P5)', '10.10.10.0/24', 'R<n> → 10.10.10.<n>'],
                ['net-1-2 (P2)', '10.10.10.0/24', 'punto a punto'],
                ['net-2-3 (P2)', '10.10.11.0/24', ''],
                ['net-3-4 (P2)', '10.10.12.0/24', ''],
                ['pool-dhcp (P6)', '192.168.1.100–200', 'arranca en .100 para no pisar el .10'],
                ['pool-pppoe (P6)', '100.64.0.10–100', 'RFC 6598, lo que P7 traduce'],
              ].map((r) => (
                <tr key={r[0]} className="border-t border-slate-100">
                  <td className="py-1.5 pr-2 font-medium">{r[0]}</td>
                  <td className="py-1.5 pr-2 font-mono">{r[1]}</td>
                  <td className="py-1.5 text-slate-500">{r[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm">Convención de IP de enlace: el último octeto es el número de nodo (R2 en net-1-2 es 10.10.10.2). Hace legibles las tablas de ruteo.</p>
        </Card>
        <Card title="Adaptadores e interfaces">
          <ul className="list-disc space-y-1 pl-5">
            <li><b>Adaptador 1 = gestión</b>, siempre: solo-anfitrión <code>vboxnet0</code>, <b>sin IP</b>. Por ahí entra WinBox (por MAC). Es <code>ether1</code> en todos los nodos.</li>
            <li>El laboratorio arranca en <code>ether2</code>. CHR numera ether1..etherN en el orden de los adaptadores: <b>no dejes huecos</b>, un adaptador deshabilitado en el medio corre toda la numeración.</li>
            <li>Nombres de Red Interna: <code>lan1</code>, <code>lan2</code>…, <code>backbone</code>, <code>net-1-2</code>, <code>net-2-3</code>, <code>net-3-4</code>.</li>
            <li>Verificá siempre con <code>/interface print</code> y <code>/ip address print</code>.</li>
            <li>Toda regla con <code>comment=</code>: sin comentario no se corrige.</li>
          </ul>
        </Card>
      </div>
      <Grid2>
        <CableWidget />
        <Card title="Plantilla del informe (para todas las prácticas)">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Topología implementada: diagrama + <code>/interface print</code> de cada VM.</li>
            <li>Direccionamiento: tabla de IPs usadas.</li>
            <li>Procedimiento: comandos ejecutados (<code>/export</code> de la config relevante).</li>
            <li>Evidencia de verificación: capturas de cada criterio de aceptación.</li>
            <li>Análisis: respuestas a las preguntas de cierre.</li>
            <li>Conclusión y problemas encontrados.</li>
          </ol>
          <p className="text-sm">Higiene: armá una CHR-base y cloná con <b>clon enlazado</b>; cambiá identity/IP tras clonar (<code>/system identity set name=R2</code>); guardá un <code>/export</code> al cerrar cada práctica; nunca credenciales reales en el informe.</p>
        </Card>
      </Grid2>
      <Grid2>
        <Card title="Primer acceso y primera IP">
          <pre className="rounded-lg bg-slate-900 p-3 font-mono text-[13px] text-teal-200">{`# Router-Borde (gateway de la LAN, va en .1)
/ip address add address=192.168.1.1/24 interface=ether2 comment="gateway LAN1"
# Cliente-Virtual (va en .10)
/ip address add address=192.168.1.10/24 interface=ether2 comment="cliente LAN1"
/ip address print
/interface print`}</pre>
          <p className="text-sm">Usuario <code>admin</code> sin contraseña en una CHR nueva. WinBox → Neighbors la encuentra <b>por MAC</b>, antes de que exista cualquier IP: capa 2 funciona sin direccionamiento. (La Guía 0 muestra el ejemplo con <code>ether1</code>; desde P1 el laboratorio va en <code>ether2</code> porque ether1 es la gestión.)</p>
        </Card>
        <Card title="Si algo no arranca">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Sin opciones de 64 bits → habilitar VT-x / AMD-V en BIOS/UEFI.</li>
            <li>Windows lentísimo → Hyper-V / WSL2 / Plataforma de máquina virtual se pelean con VirtualBox.</li>
            <li>Linux se queja del módulo → headers del kernel o Secure Boot.</li>
            <li>Mac Apple Silicon → la CHR x86 no arranca: hablar con la cátedra.</li>
            <li>Dos VMs no se ven → el nombre de Red Interna tiene que ser idéntico, letra por letra.</li>
          </ul>
        </Card>
      </Grid2>
    </div>
  )
}
