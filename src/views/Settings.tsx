import { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { DEFAULT_USER, getNodes, useSync } from '../lib/sync'
import { db, supabase } from '../lib/db'
import { setSound, soundOn, sfx } from '../board/sounds'
import Board from '../board/Board'
import { Coach } from '../components/ui'
import { BOARDS, PIECE_SETS, getLook, pieceUrl, setLook, useLook, type Look } from '../lib/look'

const DEPTHS = [
  { d: 60000, label: 'Rápido', note: 'Unos 4 s por partida, menos fino.' },
  { d: 150000, label: 'Normal', note: 'Unos 10 s por partida. Recomendado.' },
  { d: 400000, label: 'Fino', note: 'Unos 25 s por partida.' },
  { d: 1000000, label: 'Muy fino', note: 'Alrededor de 1 min por partida.' },
]

// Italiana tras 4.c3: posición de muestra con una flecha de idea
const PREVIEW_FEN = 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/2P2N2/PP1P1PPP/RNBQK2R b KQkq - 0 4'

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="field">
      <span id={`lbl-${label}`}>{label}</span>
      <div className="seg" role="group" aria-labelledby={`lbl-${label}`}>
        {options.map(([v, t]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{t}</button>)}
      </div>
    </div>
  )
}

function Appearance() {
  const store = useStore()
  const look = useLook()
  const timer = useRef<number>()
  const change = (patch: Partial<Look>) => {
    setLook(patch)
    // guarda en la cuenta medio segundo después del último cambio
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      void store.setSettings({ prefs: { ...(store.settings.prefs ?? {}), look: getLook() } }).catch(() => {})
    }, 600)
  }
  return (
    <section className="card stack loose" aria-labelledby="aspecto">
      <div className="stack tight">
        <h2 id="aspecto">Aspecto</h2>
        <p className="sec muted">La interfaz toma el tono y el color de acento del tablero que elijas. Se guarda en tu cuenta.</p>
      </div>
      <div className="look">
        <div className="stack loose">
          <div className="field">
            <span id="lbl-tablero">Tablero</span>
            <div className="opt-grid" role="group" aria-labelledby="lbl-tablero">
              {BOARDS.map((b) => (
                <button key={b.id} type="button" className="opt" aria-pressed={look.board === b.id} onClick={() => change({ board: b.id })}>
                  <span className="swatch" aria-hidden="true">
                    {Array.from({ length: 8 }, (_, k) => <i key={k} style={{ background: (k + Math.floor(k / 4)) % 2 ? b.dark : b.light }} />)}
                  </span>
                  {b.name}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span id="lbl-piezas">Piezas</span>
            <div className="opt-grid" role="group" aria-labelledby="lbl-piezas">
              {PIECE_SETS.map((p) => (
                <button key={p.id} type="button" className="opt" aria-pressed={look.pieces === p.id} onClick={() => change({ pieces: p.id })}>
                  <span className="pieces-pre" aria-hidden="true">
                    {['wn', 'bq', 'wk'].map((c, k) => <i key={c} style={{ backgroundImage: `url("${pieceUrl(p.id, c)}")`, backgroundColor: k % 2 ? 'var(--sq-dark)' : 'var(--sq-light)' }} />)}
                  </span>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <div className="row" style={{ gap: 24, alignItems: 'flex-start' }}>
            <Seg label="Modo" value={look.mode} options={[['dark', 'Oscuro'], ['light', 'Claro'], ['auto', 'Automático']]} onChange={(mode) => change({ mode })} />
            <Seg label="Color de la interfaz" value={look.tint} options={[['board', 'A juego con el tablero'], ['neutral', 'Neutro']]} onChange={(tint) => change({ tint })} />
            <Seg label="Coordenadas" value={look.coords} options={[['in', 'Mostrar'], ['off', 'Ocultar']]} onChange={(coords) => change({ coords })} />
            <Seg label="Movimiento de las piezas" value={look.anim} options={[['normal', 'Normal'], ['fast', 'Rápido'], ['off', 'Sin animación']]} onChange={(anim) => change({ anim })} />
          </div>
        </div>
        <div className="preview" aria-label="Vista previa">
          <Board fen={PREVIEW_FEN} orientation="w" lastMove={['c2', 'c3']} arrows={[{ from: 'd2', to: 'd4', color: 'green' }]} marks={[{ sq: 'f7', color: 'orange' }]} />
          <Coach kind="good" title="Bien: c3">Prepara d4 para ganar el centro.</Coach>
          <div className="row"><span className="btn primary" aria-hidden="true">Siguiente línea</span><span className="btn" aria-hidden="true">Pista</span></div>
        </div>
      </div>
    </section>
  )
}

export default function SettingsView() {
  const store = useStore()
  const sync = useSync()
  const [user, setUser] = useState(store.settings.chesscom_username ?? DEFAULT_USER)
  const [saved, setSaved] = useState(false)
  const [depth, setDepth] = useState(getNodes())
  const [sound, setSnd] = useState(soundOn())
  const [email, setEmail] = useState('')
  useEffect(() => { db.user().then((u) => setEmail(u?.email ?? '')) }, [])

  return (
    <div className="page settings">
      <h1>Ajustes</h1>
      <Appearance />
      <div className="settings-grid">
        <section className="card stack" aria-labelledby="cc">
          <h2 id="cc">Chess.com</h2>
          <label className="f" htmlFor="ccuser">Tu usuario de Chess.com
            <input id="ccuser" className="input" value={user} autoComplete="off" onChange={(e) => { setUser(e.target.value); setSaved(false) }} />
          </label>
          <div className="row">
            <button type="button" className="btn primary" disabled={!user.trim()} onClick={async () => { await store.setSettings({ chesscom_username: user.trim() }); setSaved(true) }}>Guardar usuario</button>
            {saved && <span className="sec" style={{ color: 'var(--good)' }} role="status">Guardado</span>}
          </div>
        </section>
        <section className="card stack" aria-labelledby="motor">
          <h2 id="motor">Análisis</h2>
          <p className="sec muted">El motor (Stockfish 17) corre en tu navegador. Más fino es más preciso y más lento.</p>
          <div className="seg" role="group" aria-label="Profundidad del análisis">
            {DEPTHS.map((x) => (
              <button key={x.d} type="button" aria-pressed={depth === x.d}
                onClick={() => { setDepth(x.d); try { localStorage.setItem('r1000.nodes', String(x.d)) } catch { /* sin almacenamiento */ } }}>
                {x.label}
              </button>
            ))}
          </div>
          <span className="meta">{DEPTHS.find((x) => x.d === depth)?.note}</span>
        </section>
        <section className="card stack" aria-labelledby="sonido">
          <h2 id="sonido">Sonido</h2>
          <label className="check"><input type="checkbox" checked={sound} onChange={(e) => { setSound(e.target.checked); setSnd(e.target.checked); if (e.target.checked) sfx.move() }} /> Sonidos de las piezas y de acierto o fallo</label>
        </section>
        <section className="card stack" aria-labelledby="datos">
          <h2 id="datos">Datos</h2>
          <p className="sec muted">{store.games.length} partidas, {store.puzzles.length} ejercicios y {Object.keys(store.reviews).length} elementos con progreso guardados en tu cuenta.</p>
          {!store.games.some((g) => g.source === 'seed') && (
            <div><button type="button" className="btn" disabled={sync.running} onClick={() => sync.importSeed()}>Importar mis 500 partidas analizadas</button></div>
          )}
        </section>
        <section className="card stack" aria-labelledby="cuenta">
          <h2 id="cuenta">Cuenta</h2>
          <p className="sec muted">Sesión iniciada como {email}.</p>
          <div><button type="button" className="btn" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button></div>
        </section>
      </div>
      <p className="foot-note">
        Motor: Stockfish 17.1 lite (GPLv3). Piezas de Lichess: {PIECE_SETS.map((p) => `${p.name} (${p.license})`).join('; ')}. Partidas: API pública de Chess.com.
      </p>
    </div>
  )
}
