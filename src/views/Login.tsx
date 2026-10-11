import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/db'

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const r = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + window.location.pathname } })
    setBusy(false)
    if (r.error) {
      const t = r.error.message.includes('Invalid login') ? 'Email o contraseña incorrectos.' : r.error.message
      setMsg({ ok: false, text: t })
    } else if (mode === 'up' && !r.data.session) {
      setMsg({ ok: true, text: 'Cuenta creada. Revisa tu correo y confirma el enlace para entrar.' })
    }
  }

  return (
    <div className="center-screen">
      <form className="card stack" style={{ width: 'min(400px, 100%)', padding: 24 }} onSubmit={submit}>
        <div className="brand" style={{ padding: 0 }}><span className="logo" />Ruta a 1000</div>
        <div>
          <h1 style={{ fontSize: 22 }}>{mode === 'in' ? 'Entra para seguir entrenando' : 'Crea tu cuenta'}</h1>
          <p className="muted" style={{ margin: 0 }}>Tu progreso se guarda en tu cuenta y lo ves en cualquier dispositivo.</p>
        </div>
        <label className="f" htmlFor="email">Email
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="f" htmlFor="password">Contraseña
          <input id="password" className="input" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {msg && <div className={`banner ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
        <button className="btn primary big" type="submit" disabled={busy}>{busy ? 'Un momento…' : mode === 'in' ? 'Entrar' : 'Crear cuenta'}</button>
        <button className="btn ghost" type="button" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null) }}>
          {mode === 'in' ? 'Es mi primera vez: crear cuenta' : 'Ya tengo cuenta: entrar'}
        </button>
      </form>
    </div>
  )
}
