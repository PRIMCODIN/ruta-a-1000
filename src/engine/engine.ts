/**
 * Envoltorio de Stockfish 10 (stockfish.js, GPLv3) en un Web Worker.
 * Las peticiones van en cola: una sola búsqueda a la vez.
 */
export type EngineLine = { cp: number; mate: number | null; pv: string[] }
export type Limit = { depth?: number; nodes?: number; movetime?: number; multipv?: number }

type Job = { fen: string; limit: Limit; resolve: (l: EngineLine[]) => void; reject: (e: Error) => void }

const mateToCp = (m: number) => (m > 0 ? 1 : -1) * (10000 - 10 * Math.abs(m))

class Engine {
  private worker: Worker | null = null
  private ready: Promise<void> | null = null
  private queue: Job[] = []
  private busy = false
  private lines: EngineLine[] = []
  private current: Job | null = null
  private multipv = 1
  status: 'idle' | 'loading' | 'ready' | 'error' = 'idle'

  start() {
    if (this.ready) return this.ready
    this.status = 'loading'
    this.ready = new Promise<void>((resolve, reject) => {
      const base = import.meta.env.BASE_URL
      const file = typeof WebAssembly === 'object' ? 'stockfish.wasm.js' : 'stockfish.js'
      try {
        this.worker = new Worker(`${base}engine/${file}`)
      } catch (e) {
        this.status = 'error'
        reject(e as Error)
        return
      }
      const timer = setTimeout(() => {
        this.status = 'error'
        reject(new Error('El motor no respondió'))
      }, 20000)
      this.worker.onmessage = (ev) => {
        const line = String(ev.data)
        if (line === 'readyok' && this.status === 'loading') {
          clearTimeout(timer)
          this.status = 'ready'
          resolve()
          return
        }
        this.onLine(line)
      }
      this.worker.onerror = () => {
        clearTimeout(timer)
        this.status = 'error'
        reject(new Error('No se pudo cargar el motor'))
      }
      this.worker.postMessage('uci')
      this.worker.postMessage('setoption name Hash value 32')
      this.worker.postMessage('isready')
    })
    return this.ready
  }

  private onLine(line: string) {
    if (!this.current) return
    if (line.startsWith('info') && line.includes(' pv ')) {
      const t = line.split(' ')
      const k = t.indexOf('multipv')
      const idx = k >= 0 ? Number(t[k + 1]) - 1 : 0
      const s = t.indexOf('score')
      if (s < 0) return
      const kind = t[s + 1]
      const val = Number(t[s + 2])
      const pv = t.slice(t.indexOf('pv') + 1)
      this.lines[idx] = {
        cp: kind === 'mate' ? mateToCp(val) : val,
        mate: kind === 'mate' ? val : null,
        pv,
      }
    } else if (line.startsWith('bestmove')) {
      const job = this.current
      this.current = null
      const best = line.split(' ')[1]
      let res = this.lines.filter(Boolean)
      if (!res.length) res = best && best !== '(none)' ? [{ cp: 0, mate: null, pv: [best] }] : []
      this.lines = []
      this.busy = false
      job.resolve(res)
      this.next()
    }
  }

  private next() {
    if (this.busy || !this.worker) return
    const job = this.queue.shift()
    if (!job) return
    this.busy = true
    this.current = job
    this.lines = []
    const mpv = job.limit.multipv ?? 1
    if (mpv !== this.multipv) {
      this.worker.postMessage(`setoption name MultiPV value ${mpv}`)
      this.multipv = mpv
    }
    this.worker.postMessage(`position fen ${job.fen}`)
    const { depth, nodes, movetime } = job.limit
    this.worker.postMessage(
      depth ? `go depth ${depth}` : nodes ? `go nodes ${nodes}` : `go movetime ${movetime ?? 500}`,
    )
  }

  async analyse(fen: string, limit: Limit): Promise<EngineLine[]> {
    await this.start()
    return new Promise((resolve, reject) => {
      this.queue.push({ fen, limit, resolve, reject })
      this.next()
    })
  }

  async bestMove(fen: string, movetime = 500) {
    const l = await this.analyse(fen, { movetime })
    return l[0]?.pv[0] ?? null
  }

  /** Vacía la cola pendiente (la búsqueda en curso termina sola). */
  clear() {
    const q = this.queue
    this.queue = []
    q.forEach((j) => j.reject(new Error('cancelado')))
  }
}

export const engine = new Engine()
