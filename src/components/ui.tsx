import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowsClockwise, BookOpenText, Lightbulb, ShieldWarning, Eye, ChartLineUp, DotsThreeOutline, FlagCheckered, GearSix, ListBullets, PuzzlePiece, Target, TreeStructure } from '@phosphor-icons/react'
import { winPct } from '../lib/chess-utils'

export function EvalBar({ cpWhite, orientation }: { cpWhite: number | null; orientation: 'w' | 'b' }) {
  const w = cpWhite === null ? 50 : winPct(cpWhite)
  const label = cpWhite === null ? '' : Math.abs(cpWhite) >= 9000 ? `M${Math.round((10000 - Math.abs(cpWhite)) / 10)}` : (Math.abs(cpWhite) / 100).toFixed(1)
  const flip = orientation === 'b'
  return (
    <div className="evalbar" style={flip ? { transform: 'rotate(180deg)' } : undefined} aria-label={`Evaluación ${label}`}>
      <div className="w" style={{ height: `${w}%` }} />
      <span className="lbl" style={{ bottom: w >= 50 ? 4 : undefined, top: w >= 50 ? undefined : 4, transform: flip ? 'rotate(180deg)' : undefined, color: w >= 50 ? '#2a2d33' : '#eef0ee' }}>
        {label}
      </span>
    </div>
  )
}

export function Coach({ kind = 'info', title, children }: { kind?: 'good' | 'bad' | 'info'; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="coach">
      <div className="avatar" aria-hidden="true" />
      <div className={`bubble ${kind}`} role="status">
        <b className="t">{title}</b>
        {children}
      </div>
    </div>
  )
}

export const Logo = () => <span className="logo" aria-hidden="true"><i /><i /><i /><i /></span>

export function Mastery({ box }: { box: number }) {
  return (
    <span className="mastery" aria-label={`Nivel ${box} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= box ? 'on' : ''} />)}
    </span>
  )
}

export function Progress({ value }: { value: number }) {
  return <div className="progress"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
}

export function ArrowLegend() {
  return (
    <div className="legend">
      <span><i style={{ background: '#14b8a6' }} />Lo bueno</span>
      <span><i style={{ background: '#f0483c' }} />Amenaza o error</span>
      <span><i style={{ background: '#f5a524' }} />Pista / idea</span>
    </div>
  )
}

const ic = { size: 20, weight: 'regular' as const, 'aria-hidden': true }
export const Icons = {
  hoy: <Target {...ic} />,
  repertorio: <BookOpenText {...ic} />,
  aperturas: <TreeStructure {...ic} />,
  errores: <PuzzlePiece {...ic} />,
  finales: <FlagCheckered {...ic} />,
  partidas: <ListBullets {...ic} />,
  progreso: <ChartLineUp {...ic} />,
  ajustes: <GearSix {...ic} />,
  mas: <DotsThreeOutline {...ic} />,
  refresh: <ArrowsClockwise {...ic} />,
  hint: <Lightbulb {...ic} size={18} />,
  threats: <ShieldWarning {...ic} size={18} />,
  eye: <Eye {...ic} size={18} />,
}

export const SERIES_COLORS = ['#4894e2', '#c0841f', '#e05a8a'] // validados sobre #262421 (ΔE CVD ≥ 11)

/** Gráfica de líneas SVG: rejilla tenue, punto final destacado, leyenda y tooltip con cruz al pasar el ratón. */
export function LineChart({
  series, height = 180, fmt = (v: number) => String(Math.round(v)), yMin, yMax, baseline, baselineLabel,
}: {
  series: { name: string; color: string; pts: { x: string; y: number }[] }[]
  height?: number
  fmt?: (v: number) => string
  yMin?: number
  yMax?: number
  baseline?: number
  baselineLabel?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  // el viewBox sigue al ancho real: 1 unidad = 1 px, así el texto mide lo que dice
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(640)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const all = series.flatMap((s) => s.pts)
  if (all.length < 2) return <p className="dim">Aún no hay suficientes partidas para dibujar la tendencia.</p>
  const H = height, L = 44, R = 14, T = 12, B = 26
  const xs = all.map((p) => new Date(p.x).getTime())
  const x0 = Math.min(...xs), x1 = Math.max(...xs)
  let lo = yMin ?? Math.min(...all.map((p) => p.y), baseline ?? Infinity)
  let hi = yMax ?? Math.max(...all.map((p) => p.y), baseline ?? -Infinity)
  if (hi === lo) { hi += 1; lo -= 1 }
  const pad = (hi - lo) * 0.08
  if (yMin === undefined) lo -= pad
  if (yMax === undefined) hi += pad
  const sx = (t: number) => L + ((t - x0) / Math.max(1, x1 - x0)) * (W - L - R)
  const sy = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
  const ticks = [0, 1, 2, 3].map((k) => lo + ((hi - lo) * k) / 3)
  const months: { t: number; label: string }[] = []
  const d = new Date(x0); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() + 1)
  while (d.getTime() <= x1) { months.push({ t: d.getTime(), label: d.toLocaleDateString('es-ES', { month: 'short' }) }); d.setMonth(d.getMonth() + 1) }
  const hx = hover === null ? null : x0 + ((hover - L) / (W - L - R)) * (x1 - x0)
  const near = hx === null ? [] : series.map((s) => {
    let best = s.pts[0]
    for (const p of s.pts) if (Math.abs(new Date(p.x).getTime() - hx) < Math.abs(new Date(best.x).getTime() - hx)) best = p
    return { s, p: best }
  }).filter((n) => n.p)
  return (
    <div ref={box} style={{ position: 'relative' }}>
      {series.length > 1 && (
        <div className="legend" style={{ marginBottom: 6 }}>
          {series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}
        </div>
      )}
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img"
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * W; setHover(x >= L && x <= W - R ? x : null) }}
        onPointerLeave={() => setHover(null)}>
        {ticks.map((v, k) => (
          <g key={k}>
            <line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} stroke="var(--line)" strokeWidth="1" />
            <text x={L - 6} y={sy(v) + 4} textAnchor="end" fontSize="12" fill="var(--muted)">{fmt(v)}</text>
          </g>
        ))}
        {months.map((m) => <text key={m.t} x={sx(m.t)} y={H - 8} textAnchor="middle" fontSize="12" fill="var(--muted)">{m.label}</text>)}
        {baseline !== undefined && (
          <g>
            <line x1={L} x2={W - R} y1={sy(baseline)} y2={sy(baseline)} stroke="var(--muted)" strokeDasharray="4 4" strokeWidth="1" />
            {baselineLabel && <text x={W - R} y={sy(baseline) - 5} textAnchor="end" fontSize="12" fill="var(--muted)">{baselineLabel}</text>}
          </g>
        )}
        {series.map((s) => {
          const pts = s.pts.map((p) => [sx(new Date(p.x).getTime()), sy(p.y)])
          if (!pts.length) return null
          const last = pts[pts.length - 1]
          return (
            <g key={s.name}>
              <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={last[0]} cy={last[1]} r="4.5" fill={s.color} stroke="var(--panel)" strokeWidth="2" />
            </g>
          )
        })}
        {hover !== null && near.length > 0 && (
          <g>
            <line x1={sx(new Date(near[0].p.x).getTime())} x2={sx(new Date(near[0].p.x).getTime())} y1={T} y2={H - B} stroke="var(--ink-2)" strokeWidth="1" />
            {near.map((n) => <circle key={n.s.name} cx={sx(new Date(n.p.x).getTime())} cy={sy(n.p.y)} r="4.5" fill={n.s.color} stroke="var(--panel)" strokeWidth="2" />)}
          </g>
        )}
      </svg>
      {hover !== null && near.length > 0 && (
        <div className="well chart-tip" style={{ top: series.length > 1 ? 28 : 4, left: `${Math.min(70, (hover / W) * 100)}%` }}>
          <div className="dim">{new Date(near[0].p.x).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</div>
          {near.map((n) => <div key={n.s.name}><i className="sw" style={{ background: n.s.color }} />{series.length > 1 ? `${n.s.name}: ` : ''}<b>{fmt(n.p.y)}</b></div>)}
        </div>
      )}
    </div>
  )
}
