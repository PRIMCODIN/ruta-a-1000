import { useMemo } from 'react'
import { compare, metricByKey, ratingSeries, rolling, type Comparison } from '../analysis/aggregate'
import { LineChart, SERIES_COLORS } from '../components/ui'
import { useStore } from '../lib/store'
import { go } from '../lib/router'
import { SyncButtons } from './Games'

const TRAIN_LABEL: Record<string, string> = { errores: 'Entrenar en Mis errores', repertorio: 'Repasar el repertorio', finales: 'Practicar finales' }

export default function ProgressView() {
  const store = useStore()
  const games = store.games
  const cmp = useMemo(() => compare(games), [games])
  const stuck = cmp.rows.filter((r) => r.verdict !== 'mejor').sort((a, b) => a.change - b.change)
  const better = cmp.rows.filter((r) => r.verdict === 'mejor').sort((a, b) => b.change - a.change)
  const newGames = games.filter((g) => g.source !== 'seed').length
  const win = Math.max(20, Math.min(40, Math.floor(games.length / 8)))

  const s = (key: string, color = '#81b64c') => ({ name: metricByKey[key].short, color, pts: rolling(games, metricByKey[key], win) })
  const rating = ratingSeries(games)
  const last7 = store.attempts.filter((a) => Date.now() - new Date(a.at).getTime() < 7 * 86400000)
  const solvedRate = last7.length ? last7.filter((a) => a.ok).length / last7.length : null

  if (!games.length) return (
    <div className="stack">
      <h1>Progreso</h1>
      <div className="banner">Aún no hay partidas. Importa tu análisis inicial en <a href="#/ajustes">Ajustes</a> o sincroniza Chess.com.</div>
      <SyncButtons />
    </div>
  )

  const kpiKeys = ['blundersPerGame', 'b100_medio', 'conversion', 'accuracy', 'scoreWhite', 'scoreBlack']
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Progreso · {games.length} partidas · {newGames} desde que usas la app</div>
          <h1>¿Estás mejorando?</h1>
          <p className="muted" style={{ margin: 0, maxWidth: '70ch' }}>
            Comparo tus últimas {cmp.recent.length} partidas con las {cmp.base.length} anteriores.
            {newGames < 20 && ' Con menos de 20 partidas nuevas la comparación usa tus últimas 50 partidas importadas: sincroniza para ver la tendencia real.'}
          </p>
        </div>
        <SyncButtons />
      </div>

      <div className="kpis">
        {kpiKeys.map((k) => {
          const r = cmp.rows.find((x) => x.metric.key === k)
          if (!r) return null
          return (
            <div key={k} className="kpi">
              <div className="v">{r.metric.fmt(r.after)}</div>
              <div className="k">{r.metric.label}</div>
              <Delta r={r} />
            </div>
          )
        })}
        {solvedRate !== null && (
          <div className="kpi">
            <div className="v">{Math.round(solvedRate * 100)}%</div>
            <div className="k">Ejercicios acertados (7 días)</div>
            <span className="delta igual">{last7.length} intentos</span>
          </div>
        )}
      </div>

      <div className="grid-2">
        <section className="card stack" style={{ gap: 10 }}>
          <h2>Sigue sin mejorar</h2>
          {!stuck.length && <p className="muted">Todo lo que mido ha mejorado. Sigue así.</p>}
          <div className="list">
            {stuck.map((r) => (
              <div key={r.metric.key} className="item" style={{ cursor: 'default' }}>
                <span style={{ fontWeight: 700 }}>{r.metric.label}</span>
                <span className={`pill ${r.verdict === 'peor' ? 'red' : ''}`}>{r.verdict === 'peor' ? 'Peor' : 'Estancado'}</span>
                <span className="sub">
                  Antes {r.metric.fmt(r.before)} → ahora {r.metric.fmt(r.after)}. {r.metric.hint}{' '}
                  {r.metric.train && <a href={`#/${r.metric.train}`} onClick={(e) => { e.preventDefault(); go(r.metric.train!) }}>{TRAIN_LABEL[r.metric.train]}</a>}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="card stack" style={{ gap: 10 }}>
          <h2>Has mejorado</h2>
          {!better.length && <p className="muted">Todavía nada se mueve más de un 10%. Hacen falta más partidas nuevas.</p>}
          <div className="list">
            {better.map((r) => (
              <div key={r.metric.key} className="item" style={{ cursor: 'default' }}>
                <span style={{ fontWeight: 700 }}>{r.metric.label}</span>
                <span className="pill green">Mejor</span>
                <span className="sub">Antes {r.metric.fmt(r.before)} → ahora {r.metric.fmt(r.after)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card stack">
        <div><h2>Elo por ritmo</h2><p className="dim" style={{ margin: 0 }}>Cada punto es una partida.</p></div>
        <LineChart series={Object.entries(rating).map(([k, pts], n) => ({ name: k, color: SERIES_COLORS[n % 3], pts }))} />
      </section>
      <div className="charts">
        <section className="card stack">
          <div><h2>Errores graves por partida</h2><p className="dim" style={{ margin: 0 }}>Media de las últimas {win} partidas en cada punto. Más bajo es mejor.</p></div>
          <LineChart series={[s('blundersPerGame')]} fmt={(v) => v.toFixed(1)} baseline={cmp.rows.find((r) => r.metric.key === 'blundersPerGame')?.before} baselineLabel="antes" />
        </section>
        <section className="card stack">
          <div><h2>Errores graves cada 100 jugadas, por fase</h2><p className="dim" style={{ margin: 0 }}>Media móvil de {win} partidas. Más bajo es mejor.</p></div>
          <LineChart series={[s('b100_apertura', SERIES_COLORS[0]), s('b100_medio', SERIES_COLORS[1]), s('b100_final', SERIES_COLORS[2])]} fmt={(v) => v.toFixed(1)} yMin={0} />
        </section>
        <section className="card stack">
          <div><h2>Partidas ganadas tras tener +90%</h2><p className="dim" style={{ margin: 0 }}>Media móvil de {win} partidas. Más alto es mejor.</p></div>
          <LineChart series={[s('conversion')]} fmt={(v) => `${Math.round(v * 100)}%`} yMax={1} baseline={cmp.rows.find((r) => r.metric.key === 'conversion')?.before} baselineLabel="antes" />
        </section>
        <section className="card stack">
          <div><h2>Amenazas no vistas por partida</h2><p className="dim" style={{ margin: 0 }}>Piezas movidas a casillas atacadas y amenazas ignoradas.</p></div>
          <LineChart series={[s('threatBlunders')]} fmt={(v) => v.toFixed(2)} baseline={cmp.rows.find((r) => r.metric.key === 'threatBlunders')?.before} baselineLabel="antes" />
        </section>
      </div>
      <section className="card stack">
        <h2>Todas las métricas</h2>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Métrica</th><th>Antes</th><th>Ahora</th><th>Cambio</th></tr></thead>
            <tbody>
              {cmp.rows.map((r) => (
                <tr key={r.metric.key}><td>{r.metric.label}</td><td className="num">{r.metric.fmt(r.before)}</td><td className="num">{r.metric.fmt(r.after)}</td><td><Delta r={r} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Delta({ r }: { r: Comparison }) {
  const sign = r.verdict === 'mejor' ? '▲' : r.verdict === 'peor' ? '▼' : '●'
  return <span className={`delta ${r.verdict}`}>{sign} {r.verdict === 'igual' ? 'sin cambio claro' : r.verdict === 'mejor' ? 'mejor' : 'peor'} (antes {r.metric.fmt(r.before)})</span>
}
