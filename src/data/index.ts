import LINES from './lines.json'
import ENDGAMES from './endgames.json'
import type { Endgame, Line } from './types'

export const lines = LINES as unknown as Line[]
export const endgames = ENDGAMES as unknown as Endgame[]
export type { Endgame, Line }
