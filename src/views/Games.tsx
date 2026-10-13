import { useRef, useState } from 'react'
import { Icons } from '../components/ui'
import { ClsIcon } from '../components/ClsIcon'
import { estElo } from '../analysis/review'
import { UploadSimple } from '@phosphor-icons/react'
import { useStore } from '../lib/store'
import { useSync } from '../lib/sync'
import { go } from '../lib/router'

export function SyncButtons() {
  const sync = useSync()
  const [showPgn, setShowPgn] = useState(false)
  const [text, setText] = useState('')
  const file = useRef<HTMLInputElement>(null)
  return (
    <div className="stack tight sync-btns">
      <div className="row">
        <button type="button" className="btn primary" disabled={sync.running} onClick={() => sync.syncChesscom()}>
          {Icons.refresh}<span>{sync.running ? 'Sincronizando…' : 'Actualizar desde Chess.com'}</span>
        </button>
        <button type="button" className="btn" onClick={() => setShowPgn(!showPgn)} aria-expanded={showPgn}><UploadSimple size={18} />Subir PGN</button>
      </div>
      {showPgn && (
        <div className="card stack pgn-box">
          <label className="f" htmlFor="pgnfile">Archivo .pgn (una o varias partidas)
            <input id="pgnfile" ref={file} type="file" accept=".pgn,text/plain" className="input" onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) setText(await f.text())
            }} />
          </label>
          <label className="f" htmlFor="pgntext">O pégalo aquí
            <textarea id="pgntext" className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder='[Event "Live Chess"] …' />
          </label>
          <div className="row">
            <button type="button" className="btn primary" disabled={!text.trim() || sync.running} onClick={() => { void sync.importPgnText(text); setShowPgn(false); setText('') }}>Analizar e importar</button>
            <span className="meta">Cada partida tarda unos segundos: el motor corre en tu navegador.</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Games() {
  const store = useStore()
  const [color, setColor] = useState<'all' | 'w' | 'b'>('all')
  const [res, setRes] = useState<'all' | 'W' | 'L' | 'D'>('all')
  const [n, setN] = useState(50)
  const list = [...store.games].reverse().filter((g) => (color === 'all' || g.color === color) && (res === 'all' || g.result === res))
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Tus partidas</h1>
          <p className="lead">{store.settings.last_sync_at ? `Última actualización: ${new Date(store.settings.last_sync_at).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}.` : 'Aún no has sincronizado Chess.com.'}</p>
          <p className="meta">{store.games.length} partidas{(() => { const p = store.games.filter((g) => !g.av).length; return p ? `, ${p} sin analizar (se analizan al abrirlas)` : '' })()}</p>
        </div>
        <SyncButtons />
      </div>
      <div className="stack tight">
        <div className="chips" role="group" aria-label="Color">
          {(['all', 'w', 'b'] as const).map((c) => <button key={c} type="button" className="chip" aria-pressed={color === c} onClick={() => setColor(c)}>{c === 'all' ? 'Ambos colores' : c === 'w' ? 'Blancas' : 'Negras'}</button>)}
        </div>
        <div className="chips" role="group" aria-label="Resultado">
          {(['all', 'W', 'L', 'D'] as const).map((c) => <button key={c} type="button" className="chip" aria-pressed={res === c} onClick={() => setRes(c)}>{c === 'all' ? 'Todos los resultados' : c === 'W' ? 'Victorias' : c === 'L' ? 'Derrotas' : 'Tablas'}</button>)}
        </div>
      </div>
      <div className="card table-wrap pad-s">
        <table className="t">
          <thead><tr><th>Res.</th><th>Fecha</th><th>Color</th><th>Ritmo</th><th>Elo</th><th>Precisión</th><th title="Elo aproximado al que jugaste esa partida (según la revisión)">Elo en la partida</th><th>Errores graves</th><th>Revisión</th><th>Apertura</th></tr></thead>
          <tbody>
            {list.slice(0, n).map((g) => {
              const b = g.stats ? g.stats.blunders.apertura + g.stats.blunders.medio + g.stats.blunders.final : null
              return (
                <tr key={g.id} className="click" onClick={() => go(`partidas/${g.id}`)}>
                  <td><a className="res-link" href={`#/partidas/${g.id}`} onClick={(e) => e.preventDefault()} aria-label={`Abrir partida del ${new Date(g.played_at).toLocaleDateString('es-ES')}`}><span className={`res ${g.result}`}>{g.result === 'W' ? 'G' : g.result === 'L' ? 'P' : '½'}</span></a></td>
                  <td className="num">{new Date(g.played_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                  <td><span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><span className={`sw-dot ${g.color}`} aria-hidden="true" />{g.color === 'w' ? 'Blancas' : 'Negras'}</span></td>
                  <td className="num">{fmtTc(g.time_control)}</td>
                  <td className="num">{g.my_elo ?? '-'} <span className="dim">vs {g.opp_elo ?? '-'}</span></td>
                  <td className="num">{g.stats ? `${(g.stats.review?.acc ?? g.stats.accuracy).toFixed(0)}%` : '-'}</td>
                  <td className="num">{(() => { const r = g.stats?.review; const e = r ? estElo(r.acc, g.color, g.my_elo, g.stats!.plies) : null; return e ? <span style={{ color: g.my_elo && e >= g.my_elo ? 'var(--good)' : undefined }}>≈ {e}</span> : <span className="dim">-</span> })()}</td>
                  <td className="num" style={{ color: b == null ? undefined : b ? 'var(--bad)' : 'var(--good)' }}>{b ?? '-'}</td>
                  <td><ReviewBadges g={g} /></td>
                  <td className="ellipsis">{g.stats?.bucket.replace(/^(Blancas|Negras) · /, '').replace('—', '') ?? g.opening ?? ''}</td>
                </tr>
              )
            })}
            {!list.length && (
              <tr><td colSpan={9} className="empty-row">{store.games.length ? 'Ninguna partida con estos filtros.' : 'Aún no hay partidas. Pulsa «Actualizar desde Chess.com» o sube un PGN.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {list.length > n && <div><button type="button" className="btn" onClick={() => setN(n + 50)}>Ver 50 más</button></div>}
    </div>
  )
}

const fmtTc = (tc: string | null) => {
  if (!tc) return '-'
  const [b, inc] = tc.split('+')
  const m = Number(b) / 60
  return `${m >= 1 ? m : Number(b) + 's'}${inc ? `+${inc}` : ''} min`.replace('s min', ' s')
}


/** Lo destacado de la revisión completa de una partida, si ya se hizo. */
function ReviewBadges({ g }: { g: { av?: string | null; stats?: { review?: { acc: number; c: Record<string, number | undefined> } } | null } }) {
  const r = g.stats?.review
  if (!r) return <span className="dim" title="Se analiza al abrirla">{g.av ? '-' : 'Sin analizar'}</span>
  return (
    <span className="row rbadges" style={{ gap: 8, flexWrap: 'nowrap' }}>
      <span className="num" title="Precisión de la revisión">{r.acc.toFixed(1).replace('.', ',')}</span>
      {(['brilliant', 'great', 'miss', 'blunder'] as const).map((c) => r.c[c] ? <span key={c} className="row" style={{ gap: 2, flexWrap: 'nowrap' }}><ClsIcon cls={c} size={16} /><span className="num sec">{r.c[c]}</span></span> : null)}
    </span>
  )
}
