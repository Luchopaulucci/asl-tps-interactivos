# Redes · TPs interactivos

Web interactiva para estudiar las prácticas de redes de **Administración de Servicios en Linux (UTN FRM, ciclo 2026, MikroTik CHR / RouterOS 7.20.4)**. Una página por práctica, con la topología real de cada guía (mismas IP, redes, interfaces y comandos), animada paso a paso.

| Página | Qué se ve |
| --- | --- |
| **Inicio** | Resumen y acceso a cada práctica. |
| **Guía 0** | Plan de direccionamiento, convenciones (ether1 = gestión), plantilla del informe y un widget para probar que "el cable es un nombre" (lan1 ≠ LAN1). |
| **P1 · LAN base** | Cliente-Virtual ↔ Router-Borde en lan1. ARP request (broadcast) → ARP reply (unicast) → ICMP echo request/reply. Tablas ARP de los dos nodos, ping vs arping, borrar la entrada ARP y repetir, error de máscara /32, y un **Packet Sniffer** con las columnas de WinBox (2054 / 2048). |
| **P2 · Cadena** | R1–R4 con net-1-2/2-3/3-4 y clientes opcionales. Elegís el juego de rutas estáticas (sin rutas, sólo ida, completas con default, completas explícitas), origen, destino y si apagás R2/R3. Se ve el reenvío salto a salto: MAC reescrita, IP igual, TTL que baja, traceroute (5 líneas cliente a cliente) y la falla por ruta de retorno. |
| **P3 · Backbone** | Los mismos 4 routers en 10.10.10.0/24. Rutas N×(N−1)=12, gateway correcto vs 192.168.n.1 (inactivo), sólo R1 con rutas (falta retorno), traceroute de 3 líneas y un comparador estáticas vs OSPF según la cantidad de routers. |
| **P4 · OSPF** | Hello (224.0.0.5) → Init → 2-Way → elección DR/BDR (R4/R3) → DBD/LSR → LSU a 224.0.0.6 y reinundación → Full → SPF y rutas `o` con distance 110. Escenario de **caída de un router** (elegís cuál): dead interval de 40 s, nueva elección si cae el DR/BDR, la ruta desaparece y vuelve sola. Escenario de LAN sin anunciar. Tablas: `neighbor print`, `/ip route print`, LSDB. |
| **P5 · BGP** | R1 (AS 65001) ↔ R3 (AS 65003): conexión en una sola punta (RST), TCP 179, OPEN, KEEPALIVE → established, UPDATE con AS_PATH / NEXT_HOP / NLRI y rutas `b` con distance 20. Variantes: viniendo de P4 (OSPF 110 queda de respaldo), remote.as mal (NOTIFICATION Bad Peer AS) y la pregunta 4 (AS_PATH "65003 65002"). |
| **P6·A · DHCP e IPoE** | DORA completo con xid, yiaddr, opciones 50/51/53/54/1/3/6, lease offered → bound, estado del cliente (INIT → SELECTING → REQUESTING → BOUND → RENEWING), renovación unicast en T1. Variantes: sin el objeto network ("tengo IP pero no tengo internet"), IPoE sobre vlan-acceso (VID 100, pool 100.64.1.x) y vlan-id distinto (el cliente no recibe nada). Armado (nodos/adaptadores), tabla LAN vs IPoE, comandos tal cual la guía, preguntas de cierre e informe de esta mitad. |
| **P6·B · PPPoE** | La misma topología, C1 atenuado. Descubrimiento PADI/PADO/PADR/PADS (0x8863), LCP, auth por usuario/contraseña (`abonado1`/`secreto1`), IPCP (la IP sale de `pool-pppoe` 100.64.0.10–100, no de DHCP) y la cola dinámica `<pppoe-abonado1>` que crea el `rate-limit` del perfil. Variantes: vlan-id distinto, cambio de plan 10M→50M, cortar sólo el secret (la sesión sigue viva) vs secret+sesión, y el bypass por IPoE en la misma VLAN. |

Cada página tiene: diagrama animado (SVG), controles reproducir/pausa/anterior/siguiente/reiniciar/velocidad y línea de tiempo, explicación de cada paso con el comando que se ejecuta, **inspector de paquetes** (Ethernet, IP, TTL, campos del protocolo), **tablas en vivo** que resaltan lo que cambió, la lista de comandos de la práctica con qué hace cada uno, preguntas de cierre con respuesta sugerida, qué va al informe (con la rúbrica cuando la guía la trae) y troubleshooting.

## Cómo correrlo

Requiere Node 20 o superior.

```bash
npm install
npm run dev        # abre http://localhost:5173
```

Otros comandos:

```bash
npm test           # tests de la lógica de simulación (Vitest)
npm run build      # typecheck + build estático en dist/
npm run preview    # sirve dist/ localmente
```

Es una app estática sin backend ni servicios externos (usa `HashRouter`, así que `dist/` funciona servida desde cualquier carpeta). **No está desplegada en ningún lado.**

## Estructura

```
src/
  sim/                 lógica pura, sin React (testeada)
    ip.ts              IPv4: CIDR, máscaras, pertenencia
    routing.ts         tabla de ruteo: conectadas, resolución de gateway, distance, longest prefix match
    net.ts             motor de reenvío: ARP (caché por demanda), ping salto a salto, arping, traceroute
    ospf.ts            Hello, elección DR/BDR (no preemptiva), adyacencias, LSDB, SPF, caída y vuelta de un router
    bgp.ts             sesión eBGP R1–R3: TCP, OPEN, KEEPALIVE, UPDATE, AS_PATH, distance
    dhcp.ts            pool, leases, máquina de estados del cliente, DORA, IPoE con VLAN
    pppoe.ts           pool PPP, secrets/perfiles, PADI–PADS, LCP/auth/IPCP, corte e IPoE
    types.ts           tipos compartidos (topología, pasos, paquetes, tablas)
    sim.test.ts        tests del motor (incl. P6 DHCP y PPPoE)
  data/
    topologies.ts      topologías de P1–P6 (P6·B reusa la de P6 con C1 atenuado)
    staticRoutes.ts    juegos de rutas estáticas de P2 y P3 (soluciones y errores típicos)
  components/
    Lab.tsx            reproductor: animación, controles, inspector, tablas, sniffer, lista de pasos
    TopologyView.tsx   dibujo SVG de la topología y de los paquetes en movimiento
    StaticRoutingLab.tsx  controles de P2/P3 (rutas, origen, destino, router apagado)
    ScaleWidget.tsx    comparador N×(N−1) vs 4×N
    Content.tsx        bloques de contenido (comandos, preguntas, informe, troubleshooting)
  pages/               Home, Guia0, P1 … P6, P6B
```

Cada simulador devuelve una lista de `Step` (título, explicación, comando, paquetes a animar y una foto de las tablas). La UI sólo los reproduce, así que para agregar un escenario alcanza con generar otra lista de pasos.

## Decisiones y ambigüedades del material

El material original de la cátedra **no está incluido en este repo** (derechos de autor). Lo que no estaba explícito se resolvió así:

- **Cantidad de prácticas**: el pedido decía 5, pero la materia tiene 6 publicadas (P4 OSPF y P5 BGP son dos prácticas de ruteo dinámico; DHCP/PPPoE es P6, en dos mitades). Están las 6. P7 (NAT) todavía no existe.
- **MAC**: las de P1 son las del ejemplo de la guía (Cliente 08:00:27:A1:B2:C3, Router 08:00:27:D4:E5:F6, según el diagrama y la tabla del sniffer). En la tabla de "Neighbors" de la misma guía aparecen invertidas, pero ahí WinBox descubre por la interfaz de gestión, que es otra. El resto de las MAC son ilustrativas (prefijo 08:00:27 de VirtualBox).
- **Interfaz del laboratorio**: la Guía 0 muestra el primer direccionamiento sobre `ether1`; desde P1 la convención es ether1 = gestión sin IP y el laboratorio en `ether2`. Se usa la convención de P1 en adelante.
- **Soluciones de rutas en P2/P3**: la guía deja la decisión al alumno. P2 trae dos soluciones (extremos con default = 10 rutas; todo explícito = 18). P3 trae la de 12 rutas con gateway = IP de backbone.
- **TTL inicial**: 64. **Costos OSPF**: 1 por interfaz (por defecto en RouterOS 7), así que las LAN remotas aparecen con métrica 2. Los tiempos (Hello 10 s, dead 40 s, BGP hold 180 s / keepalive 60 s, lease 30 min) son los valores por defecto que cita la guía o los de RouterOS; la animación no es en tiempo real.
- **OSPF y área distinta**: la guía de P4 dice que con area-id distinto "se ven pero no pasan de 2-Way". En OSPF real los Hello con otra área se descartan y el vecino ni siquiera aparece. No se simula ese caso; queda la tabla de troubleshooting de la guía tal cual.
- **Caída de router en OSPF**: la guía apaga R3 (el BDR). El simulador permite apagar cualquiera; si cae el DR asciende el BDR, y la elección no es preemptiva (al volver, el router no recupera su rol).
- **BGP**: con `output.redistribute=connected` también se anuncia 10.10.10.0/24; en el receptor gana la conectada (distance 0). En la pregunta 4 se asume R2 = AS 65002 por la convención 6500<n>, y se muestra NEXT_HOP 10.10.10.3 (en un segmento compartido RouterOS podría conservar 10.10.10.2).
- **DHCP**: la guía de laboratorio no detalla los mensajes DORA; los campos (xid, yiaddr, opciones 50/51/53/54) siguen la RFC 2131. El xid es fijo de ejemplo. La IP que se entrega es la más alta libre del pool (.200 / 100.64.1.100), que es lo que suele hacer RouterOS; la guía sólo exige que esté dentro de .100–.200. El Offer/Ack van a la MAC del cliente con IP destino 255.255.255.255 (depende del flag broadcast del cliente). Lease de 30 min (valor por defecto de RouterOS 7). La renovación unicast en T1 no está en los pasos del lab; se muestra para completar el ciclo.
- **Pools de P6**: la Guía 0 lista `pool-pppoe 100.64.0.10–100` (PPPoE). La mitad DHCP/IPoE usa `pool-ipoe 100.64.1.10–100` sobre 100.64.1.0/24. La mitad PPPoE usa `pool-pppoe` sobre 100.64.0.0/24, `local-address=100.64.0.1`. Son dos rangos distintos (ambos dentro de RFC 6598 / `100.64.0.0/10`).
- **P6, "dos objetos" vs "tres objetos"**: la guía habla de tres objetos (pool, network, dhcp-server) y la primera pregunta de cierre dice "dos objetos y no uno" (pool y network). Se muestran los tres y se responde la pregunta sobre pool + network.
- **PPPoE, descubrimiento y LCP/auth**: la guía de P6·B nombra **IPCP** («quien da la dirección · acá no hay DHCP») y las credenciales `/ppp secret` (`abonado1`/`secreto1`, `abonado2`/`secreto2`). **No nombra** PADI/PADO/PADR/PADS, LCP, PAP ni CHAP. El simulador muestra el descubrimiento según RFC 2516 (EtherType 0x8863/0x8864, `service-name=isp`, session-id de ejemplo `0x0001`) y un paso de LCP + autenticación por usuario/contraseña, porque el lab exige que el concentrador pida credenciales antes de IPCP. No se elige PAP ni CHAP.
- **PPPoE, IP asignada**: la guía sólo exige una dirección del pool `100.64.0.x`. El simulador entrega la primera libre desde el principio (`100.64.0.10`). El conteo 91 (pregunta 4) es `100.64.0.10`–`100.64.0.100` inclusive.
- **P6, rúbrica con puntaje**: las dos mitades de laboratorio dicen «la rúbrica está al pie de la guía de la Práctica 6». Esa guía (el documento con la tabla de puntos) **no está** en las fuentes de estas mitades. Lo que sí está, y se copia tal cual, es el checklist del informe de cada mitad (4 ítems en A, 5 en B) y las preguntas de cierre (5 + 6).
- **P6·B, pregunta 6 (IPoE para que el corte funcione)**: la guía dice que «la respuesta tiene nombre, y la vieron en la teórica». Ese nombre no aparece en `lab-p6-pppoe.html`. La pista del simulador se queda en lo que el lab demuestra (hay que cortar también el IPoE, o no ofrecer un DHCP que reparte sin preguntar en la misma VLAN) y no inventa el término de la teórica.
- **P6·B, fechas del reloj**: el HTML de la cátedra dice «mié 14-oct · 60 min / 30 min». Se deja tal cual (es el calendario de ese dictado, no un dato de red).
- **P6·B, tests automatizados del lab**: la guía menciona `lab-runner/labs/p6/test.sh` y `asl_lab test p6` contra CHR reales. Eso no forma parte de esta web.
