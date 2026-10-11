import { useEffect, useState } from 'react'

export function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash || '#/hoy')
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/hoy')
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const parts = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent)
  return { page: parts[0] || 'hoy', arg: parts.slice(1).join('/') || null }
}

export const go = (path: string) => {
  window.location.hash = `#/${path.split('/').map(encodeURIComponent).join('/')}`
  window.scrollTo({ top: 0 })
}
