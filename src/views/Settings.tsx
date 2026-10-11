import { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { DEFAULT_USER, getDepth, useSync } from '../lib/sync'
import { db, supabase } from '../lib/db'
import { setSound, soundOn, sfx } from '../board/sounds'

const DEPTHS = [
  { d: 8, label: 'Rápido', note: '≈2 s por partida, menos fino' },
  { d: 10, label: 'Normal', note: '≈5 s por partida (recomendado)' },
  { d: 12, label: 'Fino', note: '≈12 s por partida' },
  { d: 14, label: 'Muy fino', note: '≈30 s por partida' },
]

export default function SettingsView() {
  const store = useStore()
  const sync = useSync()
  const [user, setUser] = useState(store.settings.chesscom_username ?? DEFAULT_USER)
  const [saved, setSaved] = useState(false)
  const [depth, setDepth] = useState(getDepth())
  const [sound, setSnd] = useState(soundOn())
  const [email, setEmail] = useState('')
  useEffect(() => { db.user().then((u) => setEmail(u?.email ?? '')) }, [])

  return (
    <div className="stack" style={{ maxWidth: 680 }}>
      <h1>Ajustes</h1>
      <section className="card stack">
        <h2>Chess.com</h2>
        <label className="f" htmlFor="ccuser">Tu usuario de Chess.com
          <input id="ccuser" className="input" value={user} onChange={(e) => { setUser(e.target.value); setSaved(false) }} />
        </label>
        <div className="row">
          <button type="button" className="btn primary" onClick={async () => { await store.setSettings({ chesscom_username: user.trim() }); setSaved(true) }}>Guardar usuario</button>
          {saved && <span style={{ color: 'var(--green)' }}>Guardado</span>}
        </div>
      </section>
      <section className="card stack">
        <h2>Análisis</h2>
        <p className="muted" style={{ margin: 0 }}>El motor (Stockfish) corre en tu navegador. Más profundidad es más preciso y más lento.</p>
        <div className="row">
          {DEPTHS.map((x) => (
            <button key={x.d} type="button" className="chip" aria-pressed={depth === x.d} title={x.note}
              onClick={() => { setDepth(x.d); try { localStorage.setItem('r1000.depth', String(x.d)) } catch { /* sin almacenamiento */ } }}>
              {x.label} · {x.d}
            </button>
          ))}
        </div>
        <span className="dim">{DEPTHS.find((x) => x.d === depth)?.note}</span>
      </section>
      <section className="card stack">
        <h2>Sonido</h2>
        <label className="row"><input type="checkbox" checked={sound} onChange={(e) => { setSound(e.target.checked); setSnd(e.target.checked); if (e.target.checked) sfx.move() }} /> Sonidos de las piezas y de acierto/fallo</label>
      </section>
      <section className="card stack">
        <h2>Datos</h2>
        <p className="muted" style={{ margin: 0 }}>{store.games.length} partidas, {store.puzzles.length} ejercicios y {Object.keys(store.reviews).length} elementos con progreso guardados en tu cuenta.</p>
        {!store.games.some((g) => g.source === 'seed') && (
          <button type="button" className="btn" disabled={sync.running} onClick={() => sync.importSeed()}>Importar mis 500 partidas analizadas</button>
        )}
      </section>
      <section className="card stack">
        <h2>Cuenta</h2>
        <p className="muted" style={{ margin: 0 }}>Sesión iniciada como {email}.</p>
        <div><button type="button" className="btn" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button></div>
      </section>
      <p className="dim" style={{ fontSize: 12 }}>Motor: Stockfish 10 (stockfish.js, GPLv3). Piezas: cburnett (CC BY-SA 3.0). Datos de partidas: API pública de Chess.com.</p>
    </div>
  )
}
