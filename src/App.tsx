import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Guia0 from './pages/Guia0'
import P1 from './pages/P1'
import P2 from './pages/P2'
import P3 from './pages/P3'
import P4 from './pages/P4'
import P5 from './pages/P5'
import P6 from './pages/P6'

export const NAV = [
  { to: '/guia-0', short: 'G0', label: 'Guía 0 · Convenciones' },
  { to: '/p1', short: 'P1', label: 'P1 · LAN base (ARP)' },
  { to: '/p2', short: 'P2', label: 'P2 · Cadena (estático)' },
  { to: '/p3', short: 'P3', label: 'P3 · Backbone (estático)' },
  { to: '/p4', short: 'P4', label: 'P4 · OSPF' },
  { to: '/p5', short: 'P5', label: 'P5 · BGP' },
  { to: '/p6', short: 'P6', label: 'P6 · DHCP e IPoE' },
]

export default function App() {
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    window.scrollTo(0, 0)
    setOpen(false)
  }, [loc.pathname])
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <NavLink to="/" className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-700 text-sm text-white">⇄</span>
            <span className="hidden sm:inline">Redes · TPs interactivos</span>
            <span className="sm:hidden">Redes TPs</span>
          </NavLink>
          <nav className="ml-auto hidden gap-1 lg:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `rounded-md px-2.5 py-1.5 text-sm ${isActive ? 'bg-teal-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`
                }
              >
                {n.label.split(' · ')[0]}
                <span className="hidden xl:inline"> · {n.label.split(' · ')[1]}</span>
              </NavLink>
            ))}
          </nav>
          <button className="ml-auto rounded-md border border-slate-300 px-3 py-1.5 text-sm lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menú">
            ☰ Prácticas
          </button>
        </div>
        {open && (
          <nav className="grid gap-1 border-t border-slate-200 bg-white p-2 lg:hidden">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => `rounded-md px-3 py-2 text-sm ${isActive ? 'bg-teal-700 text-white' : 'text-slate-700'}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-3 py-5 sm:px-4 sm:py-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/guia-0" element={<Guia0 />} />
          <Route path="/p1" element={<P1 />} />
          <Route path="/p2" element={<P2 />} />
          <Route path="/p3" element={<P3 />} />
          <Route path="/p4" element={<P4 />} />
          <Route path="/p5" element={<P5 />} />
          <Route path="/p6" element={<P6 />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        Material de estudio basado en las guías de Administración de Servicios en Linux · UTN FRM · RouterOS 7.20.4. Simulación educativa: los tiempos y las MAC son ilustrativos.
      </footer>
    </div>
  )
}
