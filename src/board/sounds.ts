/** Sonidos sintetizados con WebAudio (sin archivos): golpe de madera, captura, jaque, acierto y fallo. */
let ctx: AudioContext | null = null
let enabled = (() => {
  try {
    return localStorage.getItem('r1000.sound') !== 'off'
  } catch {
    return true
  }
})()

export const soundOn = () => enabled
export function setSound(on: boolean) {
  enabled = on
  try {
    localStorage.setItem('r1000.sound', on ? 'on' : 'off')
  } catch {
    /* sin almacenamiento */
  }
}

function ac() {
  if (!enabled) return null
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function knock(c: AudioContext, t: number, gain: number, freq: number) {
  const len = Math.floor(c.sampleRate * 0.07)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6)
  const src = c.createBufferSource()
  src.buffer = buf
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = freq
  bp.Q.value = 1.4
  const g = c.createGain()
  g.gain.value = gain
  src.connect(bp).connect(g).connect(c.destination)
  src.start(t)
  const o = c.createOscillator()
  const og = c.createGain()
  o.frequency.setValueAtTime(180, t)
  o.frequency.exponentialRampToValueAtTime(70, t + 0.06)
  og.gain.setValueAtTime(gain * 0.5, t)
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.07)
  o.connect(og).connect(c.destination)
  o.start(t)
  o.stop(t + 0.08)
}

function tone(c: AudioContext, t: number, f: number, dur: number, type: OscillatorType, gain: number) {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.value = f
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(c.destination)
  o.start(t)
  o.stop(t + dur + 0.02)
}

export const sfx = {
  move() {
    const c = ac()
    if (c) knock(c, c.currentTime, 0.9, 1700)
  },
  capture() {
    const c = ac()
    if (!c) return
    knock(c, c.currentTime, 1.2, 1300)
    knock(c, c.currentTime + 0.045, 0.7, 2200)
  },
  check() {
    const c = ac()
    if (!c) return
    knock(c, c.currentTime, 0.9, 1700)
    tone(c, c.currentTime + 0.03, 1320, 0.12, 'triangle', 0.08)
  },
  good() {
    const c = ac()
    if (!c) return
    tone(c, c.currentTime, 660, 0.14, 'sine', 0.12)
    tone(c, c.currentTime + 0.1, 990, 0.22, 'sine', 0.12)
  },
  bad() {
    const c = ac()
    if (!c) return
    tone(c, c.currentTime, 220, 0.18, 'triangle', 0.1)
    tone(c, c.currentTime + 0.09, 165, 0.22, 'triangle', 0.1)
  },
  forSan(san: string) {
    if (san.includes('+') || san.includes('#')) sfx.check()
    else if (san.includes('x')) sfx.capture()
    else sfx.move()
  },
}
