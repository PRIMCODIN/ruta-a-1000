import { useState } from 'react'

export function getSide(): 'w' | 'b' {
  try {
    return localStorage.getItem('r1000.side') === 'b' ? 'b' : 'w'
  } catch {
    return 'w'
  }
}

/** Selector Blancas / Negras, recordado entre visitas. */
export function useSide() {
  const [side, setSideState] = useState<'w' | 'b'>(getSide)
  const setSide = (s: 'w' | 'b') => {
    setSideState(s)
    try {
      localStorage.setItem('r1000.side', s)
    } catch {
      /* sin almacenamiento */
    }
  }
  return [side, setSide] as const
}

export function SideSwitch({ side, onChange }: { side: 'w' | 'b'; onChange: (s: 'w' | 'b') => void }) {
  return (
    <div className="seg" role="group" aria-label="Color">
      <button type="button" aria-pressed={side === 'w'} onClick={() => onChange('w')}><span className="sw" style={{ background: '#eef2f7' }} />Con blancas</button>
      <button type="button" aria-pressed={side === 'b'} onClick={() => onChange('b')}><span className="sw" style={{ background: '#1b2233' }} />Con negras</button>
    </div>
  )
}
