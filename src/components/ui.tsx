import { useState, type ReactNode } from 'react'
import { PIECES } from '../board/pieces'
import { winPct } from '../lib/chess-utils'

export function EvalBar({ cpWhite, orientation }: { cpWhite: number | null; orientation: 'w' | 'b' }) {
  const w = cpWhite === null ? 50 : winPct(cpWhite)
  const label = cpWhite === null ? '' : Math.abs(cpWhite) >= 9000 ? `M${Math.round((10000 - Math.abs(cpWhite)) / 10)}` : (Math.abs(cpWhite) / 100).toFixed(1)
  const flip = orientation === 'b'
  return (
    <div className="evalbar" style={flip ? { transform: 'rotate(180deg)' } : undefined} aria-label={`Evaluación ${label}`}>
      <div className="w" style={{ height: `${w}%` }} />
      <span className="lbl" style={{ bottom: w >= 50 ? 4 : undefined, top: w >= 50 ? undefined : 4, transform: flip ? 'rotate(180deg)' : undefined, color: w >= 50 ? '#1d2b4a' : '#eef2f7' }}>
        {label}
      </span>
    </div>
  )
}

export function Coach({ kind = 'info', title, children }: { kind?: 'good' | 'bad' | 'info'; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="coach">
      <div className="avatar" style={{ backgroundImage: `url("${PIECES.wn}")` }} aria-hidden="true" />
      <div className={`bubble ${kind}`} role="status">
        <b className="t">{title}</b>
        {children}
      </div>
    </div>
  )
}

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

const I = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)
export const Icons = {
  hoy: I('M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'),
  repertorio: I('M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5zM4 21a2 2 0 0 1 2-2h13'),
  aperturas: I('M5 21h14M7 21v-3h10v3M9 18l1-7M15 18l-1-7M8 11h8M10 11V8l2-5 2 5v3'),
  errores: I('M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'),
  finales: I('M9 21h6M10 17h4M12 3a2 2 0 0 1 2 2c0 1-1 2-1 2h-2s-1-1-1-2a2 2 0 0 1 2-2zM8 17l1-8h6l1 8'),
  partidas: I('M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z'),
  progreso: I('M3 20h18M5 16l4-5 4 3 6-8'),
  ajustes: I('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'),
  refresh: I('M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6'),
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
  const all = series.flatMap((s) => s.pts)
  if (all.length < 2) return <p className="dim">Aún no hay suficientes partidas para dibujar la tendencia.</p>
  const W = 640, H = height, L = 44, R = 14, T = 12, B = 26
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
    <div style={{ position: 'relative' }}>
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
            <text x={L - 6} y={sy(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{fmt(v)}</text>
          </g>
        ))}
        {months.map((m) => <text key={m.t} x={sx(m.t)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{m.label}</text>)}
        {baseline !== undefined && (
          <g>
            <line x1={L} x2={W - R} y1={sy(baseline)} y2={sy(baseline)} stroke="var(--muted)" strokeDasharray="4 4" strokeWidth="1" />
            {baselineLabel && <text x={W - R} y={sy(baseline) - 5} textAnchor="end" fontSize="11" fill="var(--muted)">{baselineLabel}</text>}
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
        <div className="card flat" style={{ position: 'absolute', top: series.length > 1 ? 28 : 4, left: `${Math.min(70, (hover / W) * 100)}%`, padding: '6px 10px', fontSize: 12.5, pointerEvents: 'none', boxShadow: '0 4px 12px rgba(0,0,0,.4)' }}>
          <div className="dim">{new Date(near[0].p.x).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</div>
          {near.map((n) => <div key={n.s.name}><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: n.s.color, marginRight: 6 }} />{series.length > 1 ? `${n.s.name}: ` : ''}<b>{fmt(n.p.y)}</b></div>)}
        </div>
      )}
    </div>
  )
}
