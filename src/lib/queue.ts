/**
 * Cola de navegación: la lista desde la que entras (filtros incluidos) decide cuál es
 * el «siguiente» ejercicio. Se guarda en sessionStorage para sobrevivir a una recarga.
 */
const mem: Record<string, string[]> = {}

export function setQueue(kind: string, ids: string[]) {
  mem[kind] = ids
  try {
    sessionStorage.setItem(`r1000.q.${kind}`, JSON.stringify(ids))
  } catch {
    /* sin almacenamiento */
  }
}

export function getQueue(kind: string): string[] {
  if (mem[kind]) return mem[kind]
  try {
    return JSON.parse(sessionStorage.getItem(`r1000.q.${kind}`) ?? '[]')
  } catch {
    return []
  }
}

/** Siguiente id después de `current`; `prefer` filtra (p. ej. solo pendientes) si hay alguno que cumpla. */
export function nextInQueue(kind: string, current: string, prefer?: (id: string) => boolean): string | null {
  const q = getQueue(kind)
  const k = q.indexOf(current)
  const after = [...q.slice(k + 1), ...q.slice(0, Math.max(0, k))].filter((id) => id !== current)
  if (prefer) {
    const p = after.find(prefer)
    if (p) return p
  }
  return k >= 0 && k + 1 < q.length ? q[k + 1] : null
}
