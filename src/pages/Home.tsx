import { Link } from 'react-router-dom'

const CARDS = [
  { to: '/guia-0', tag: 'Guía 0', title: 'Convenciones y entorno', text: 'El plan de direccionamiento fijo, los nombres de Red Interna y por qué "el cable es un nombre". Probalo con dos VMs de juguete.', sees: ['192.168.<n>.0/24', 'ether1 = gestión', 'lan1 ≠ LAN1'] },
  { to: '/p1', tag: 'P1', title: 'LAN base: ARP, ping y sniffer', text: 'Cliente-Virtual y Router-Borde en lan1. Mirá el ARP request en broadcast, el reply en unicast, cómo se llenan las dos tablas ARP y recién después el ICMP.', sees: ['tabla ARP', 'ping vs arping', 'sniffer WinBox'] },
  { to: '/p2', tag: 'P2', title: 'Cadena de routers', text: 'Cuatro routers en línea con rutas estáticas. Elegí origen y destino y seguí el paquete salto a salto: la MAC cambia, la IP no, el TTL baja.', sees: ['next-hop', 'ruta de retorno', 'traceroute 5 líneas'] },
  { to: '/p3', tag: 'P3', title: 'Estrella / backbone', text: 'Los mismos cuatro routers en un segmento compartido 10.10.10.0/24. Todos son vecinos, pero las rutas siguen a mano: N×(N−1).', sees: ['gateway correcto', '12 rutas', '3 líneas de traceroute'] },
  { to: '/p4', tag: 'P4', title: 'OSPF', text: 'Hello, 2-Way, elección de DR/BDR, Full, inundación de LSA y SPF. Después apagá un router y mirá cómo reconverge solo.', sees: ['DR = R4, BDR = R3', 'Full vs 2-Way', 'dead 40 s'] },
  { to: '/p5', tag: 'P5', title: 'BGP', text: 'R1 (AS 65001) y R3 (AS 65003): TCP 179, OPEN, KEEPALIVE, UPDATE con AS_PATH y la ruta b con distance 20.', sees: ['established', 'una sola punta = no sube', 'eBGP 20 vs OSPF 110'] },
  { to: '/p6', tag: 'P6·A', title: 'DHCP e IPoE', text: 'DORA paso a paso: Discover en broadcast, Offer, Request, Ack. El lease en R1, el network que se olvida y el mismo servidor sobre la VLAN 100.', sees: ['xid / yiaddr', 'lease bound', 'VID 100'] },
  { to: '/p6b', tag: 'P6·B', title: 'PPPoE', text: 'Antes de dar dirección, usuario y contraseña. PADI/PADO/PADR/PADS, LCP, auth, IPCP (la IP no sale de DHCP) y la cola del plan que aparece sola. Después, cortar el servicio — y por qué a veces no alcanza.', sees: ['session-id', 'IPCP 100.64.0.x', 'cola <pppoe-abonado1>'] },
]

export default function Home() {
  return (
    <div>
      <section className="mb-8 rounded-3xl bg-gradient-to-br from-teal-800 to-slate-900 p-6 text-white shadow-lg sm:p-10">
        <div className="text-sm font-semibold uppercase tracking-wider text-teal-200">Administración de Servicios en Linux · UTN FRM · RouterOS 7.20.4</div>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Las prácticas de redes, viéndolas pasar</h1>
        <p className="mt-3 max-w-3xl text-teal-50/90">
          Una página por práctica, con la topología real de cada guía (mismas IP, redes, interfaces y comandos). Le das play y ves cada trama moverse por el cable, cómo se llenan las tablas ARP y de ruteo, qué lleva cada encabezado y qué hace cada comando.
        </p>
        <div className="mt-5 grid gap-2 text-sm text-teal-50 sm:grid-cols-3">
          <div className="rounded-xl bg-white/10 p-3">▶ <b>Reproducir</b> o avanzá paso a paso con ◀ ▶. Cambiá la velocidad.</div>
          <div className="rounded-xl bg-white/10 p-3">🔍 El <b>inspector</b> muestra Ethernet, IP, TTL y los campos del protocolo de cada paquete.</div>
          <div className="rounded-xl bg-white/10 p-3">📋 Las <b>tablas en vivo</b> resaltan en amarillo lo que cambió en ese paso.</div>
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => (
          <Link key={c.to} to={c.to} className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md">
            <span className="w-fit rounded-md bg-teal-700 px-2 py-0.5 text-xs font-bold text-white">{c.tag}</span>
            <h2 className="mt-2 text-lg font-semibold text-slate-900 group-hover:text-teal-800">{c.title}</h2>
            <p className="mt-1 flex-1 text-sm leading-relaxed text-slate-600">{c.text}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {c.sees.map((s) => (
                <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{s}</span>
              ))}
            </div>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-sm text-slate-500">
        La materia tiene 6 prácticas publicadas (P1 a P6, esta última en dos mitades); la P7 (NAT / CGNAT) todavía no está.
      </p>
    </div>
  )
}
