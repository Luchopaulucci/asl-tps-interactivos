// Juegos de rutas estáticas para P2 y P3. La guía deja la decisión al alumno; estas son
// las soluciones que se desprenden del material (y variantes con errores típicos).
import type { Route } from '../sim/types'

const s = (dst: string, gateway: string, comment: string): Route => ({ dst, gateway, proto: 'static', distance: 1, comment })

export interface RoutePreset {
  id: string
  label: string
  description: string
  routes: Record<string, Route[]>
}

export const p2Presets: RoutePreset[] = [
  {
    id: 'none',
    label: 'Sin rutas (sólo conectadas)',
    description: 'El cierre del miércoles: el vecino directo responde, pero la LAN del vecino no. Cada router sólo conoce sus redes conectadas.',
    routes: {},
  },
  {
    id: 'ida',
    label: 'Sólo las rutas de ida (falta el retorno)',
    description: 'R1, R2 y R3 saben llegar a la LAN 4, pero nadie le dijo a R4 (ni a R3, ni a R2) cómo volver a la LAN 1. El error dominante de la práctica.',
    routes: {
      R1: [s('0.0.0.0/0', '10.10.10.2', 'default a R2')],
      R2: [s('192.168.4.0/24', '10.10.11.3', 'LAN R4 via R3')],
      R3: [s('192.168.4.0/24', '10.10.12.4', 'LAN R4 via R4')],
    },
  },
  {
    id: 'full',
    label: 'Completa: extremos con default, intermedios con rutas',
    description: 'Los extremos tienen una sola salida: alcanza una ruta por defecto. Los intermedios tienen dos vecinos y necesitan saber qué redes hay de cada lado.',
    routes: {
      R1: [s('0.0.0.0/0', '10.10.10.2', 'default a R2')],
      R2: [
        s('192.168.1.0/24', '10.10.10.1', 'LAN R1 via R1'),
        s('192.168.3.0/24', '10.10.11.3', 'LAN R3 via R3'),
        s('192.168.4.0/24', '10.10.11.3', 'LAN R4 via R3'),
        s('10.10.12.0/24', '10.10.11.3', 'net-3-4 via R3'),
      ],
      R3: [
        s('192.168.1.0/24', '10.10.11.2', 'LAN R1 via R2'),
        s('192.168.2.0/24', '10.10.11.2', 'LAN R2 via R2'),
        s('10.10.10.0/24', '10.10.11.2', 'net-1-2 via R2'),
        s('192.168.4.0/24', '10.10.12.4', 'LAN R4 via R4'),
      ],
      R4: [s('0.0.0.0/0', '10.10.12.3', 'default a R3')],
    },
  },
  {
    id: 'explicit',
    label: 'Completa: todas las redes explícitas',
    description: 'Misma conectividad sin rutas por defecto: cada router lista cada red remota. Sirve para contar cuántas rutas cuesta.',
    routes: {
      R1: ['192.168.2.0/24', '192.168.3.0/24', '192.168.4.0/24', '10.10.11.0/24', '10.10.12.0/24'].map((d) => s(d, '10.10.10.2', `${d} via R2`)),
      R2: [
        s('192.168.1.0/24', '10.10.10.1', 'LAN R1 via R1'),
        ...['192.168.3.0/24', '192.168.4.0/24', '10.10.12.0/24'].map((d) => s(d, '10.10.11.3', `${d} via R3`)),
      ],
      R3: [
        ...['192.168.1.0/24', '192.168.2.0/24', '10.10.10.0/24'].map((d) => s(d, '10.10.11.2', `${d} via R2`)),
        s('192.168.4.0/24', '10.10.12.4', 'LAN R4 via R4'),
      ],
      R4: ['192.168.1.0/24', '192.168.2.0/24', '192.168.3.0/24', '10.10.10.0/24', '10.10.11.0/24'].map((d) => s(d, '10.10.12.3', `${d} via R3`)),
    },
  },
]

function p3Full(): Record<string, Route[]> {
  const out: Record<string, Route[]> = {}
  for (const n of [1, 2, 3, 4]) {
    out[`R${n}`] = [1, 2, 3, 4]
      .filter((m) => m !== n)
      .map((m) => s(`192.168.${m}.0/24`, `10.10.10.${m}`, `LAN R${m}`))
  }
  return out
}

export const p3Presets: RoutePreset[] = [
  {
    id: 'none',
    label: 'Sin rutas (sólo conectadas)',
    description: 'Cierre del miércoles: R4 contesta en el backbone (10.10.10.4) pero su LAN (192.168.4.1) no. Todos son vecinos, pero ninguno conoce las LAN de los demás.',
    routes: {},
  },
  {
    id: 'onlyR1',
    label: 'Rutas sólo en R1 (falta el retorno)',
    description: 'R1 sabe llegar a las tres LAN remotas, pero los demás no saben volver a 192.168.1.0/24.',
    routes: { R1: p3Full().R1 },
  },
  {
    id: 'full',
    label: 'Completa: 3 rutas por router (12 en total)',
    description: 'Una ruta por cada LAN remota, con gateway = IP de backbone del dueño de esa LAN. N×(N−1) = 12.',
    routes: p3Full(),
  },
  {
    id: 'wronggw',
    label: 'Error: gateway = IP de LAN del otro router',
    description: 'R1 apunta a 192.168.4.1 en vez de 10.10.10.4. Esa dirección no está en ninguna red conectada de R1: la ruta queda inactiva (gateway inalcanzable). Es la que "no puede funcionar nunca".',
    routes: { ...p3Full(), R1: [s('192.168.2.0/24', '10.10.10.2', 'LAN R2'), s('192.168.3.0/24', '10.10.10.3', 'LAN R3'), s('192.168.4.0/24', '192.168.4.1', 'LAN R4 (mal)')] },
  },
]
