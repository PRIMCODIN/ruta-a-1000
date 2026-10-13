import { ArrowRight, BookOpen, Check, Star, ThumbsUp, X } from '@phosphor-icons/react'
import { CLS_META, type Cls } from '../analysis/review'

/** Icono redondo de la clase de jugada (Brillante, Error grave…). */
export function ClsIcon({ cls, size = 20, title = true }: { cls: Cls; size?: number; title?: boolean }) {
  const m = CLS_META[cls]
  const g = Math.round(size * 0.62)
  const inner =
    cls === 'best' ? <Star size={g} weight="fill" />
      : cls === 'excellent' ? <ThumbsUp size={g} weight="fill" />
        : cls === 'good' ? <Check size={g} weight="bold" />
          : cls === 'book' ? <BookOpen size={g} weight="fill" />
            : cls === 'forced' ? <ArrowRight size={g} weight="bold" />
              : cls === 'miss' ? <X size={g} weight="bold" />
                : <span style={{ fontSize: Math.max(10, Math.round(size * 0.52)) }}>{m.sym}</span>
  return (
    <span className="cls-ic" style={{ background: m.color, width: size, height: size }} role="img" aria-label={m.label} title={title ? m.label : undefined}>
      {inner}
    </span>
  )
}
