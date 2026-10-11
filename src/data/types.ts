export type Line = {
  id: string
  group: string
  side: 'w' | 'b'
  name: string
  moves: string[]
  intro?: string
  outro?: string
  notes: Record<string, string>
}

export type Endgame = {
  id: string
  cat: string
  title: string
  fen: string
  color: 'w' | 'b'
  goal: 'mate' | 'promote' | 'draw'
  limit: number
  goalTxt: string
  plan: string
  startQ: number
}
