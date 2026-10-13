import { memo, useEffect, useRef, useState } from 'react'
import './App.css'

/* ---------- constants (SVG units, viewBox 1000 x 500) ---------- */
const TOTAL = 5
const CX = 790, CY = 250          // target centre
const STEP = 15, R = STEP * 10    // ring width, target radius
const PIV = { x: 170, y: 330 }    // bow grip
const GROUND = 446
const L = 84                      // arrow length
const G = 900                     // gravity
const VMAX = 1300                 // arrow speed at full pull
const MAXPULL = 140               // drag distance for full power
// Target sway per arrow. All zeros = target stays still.
// Want it harder? Try [0, 15, 25, 35, 45]
const AMPS = [0, 0, 0, 0, 0]
const RING = ['#fff7e0', '#fff7e0', '#262637', '#262637', '#3b82c4', '#3b82c4', '#e04848', '#e04848', '#ffd34d', '#ffd34d']
const DARK = [1, 2, 9, 10]

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const pullOf = (p) => 12 + p * 50
const scoreAt = (d) => Math.max(10 - Math.floor(d / STEP), 0)
const deg = (r) => (r * 180) / Math.PI
const label = (p) => (p === 10 ? 'Bullseye!' : p >= 8 ? 'Great shot!' : p >= 5 ? 'Nice one' : p >= 1 ? 'On the board' : 'Missed')

const GRASS = 'M0 500 L0 446 ' + Array.from({ length: 51 }, (_, i) => `L${i * 20} ${i % 2 ? 437 : 447}`).join(' ') + ' L1000 500Z'
const tree = (x, y, s) =>
  `M${x} ${y - 70 * s} L${x + 17 * s} ${y - 28 * s} L${x + 9 * s} ${y - 28 * s} L${x + 24 * s} ${y} L${x - 24 * s} ${y} L${x - 9 * s} ${y - 28 * s} L${x - 17 * s} ${y - 28 * s}Z`
const TREES = [[34, 432, 1.3], [250, 428, 0.9], [940, 432, 1.2], [985, 428, 0.8]]
const STARS = [[70, 40], [190, 95], [330, 30], [470, 70], [620, 28], [720, 80], [880, 40], [950, 110], [540, 120]]
const SPARKS = Array.from({ length: 10 }, (_, i) => {
  const ang = (i / 10) * Math.PI * 2, dist = 24 + (i % 3) * 12
  return { dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist }
})

let ac
const beep = (f, d = 0.12, type = 'triangle', v = 0.1) => {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)()
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime
    o.type = type
    o.frequency.setValueAtTime(f, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(f / 2, 30), t + d)
    g.gain.setValueAtTime(v, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + d)
    o.connect(g).connect(ac.destination)
    o.start(); o.stop(t + d)
  } catch { /* sound is optional */ }
}

/* ---------- static pieces (memoised so they never re-render) ---------- */
function ArrowShape() {
  return (
    <>
      <line x1="0" y1="0" x2={L - 12} y2="0" stroke="#f0dcae" strokeWidth="3.5" strokeLinecap="round" />
      <polygon points={`${L},0 ${L - 18},-6 ${L - 18},6`} fill="#e6edf5" />
      <polygon points="2,0 16,-10 34,-10 26,0" fill="#ff5a4f" />
      <polygon points="2,0 16,10 34,10 26,0" fill="#ffb199" />
    </>
  )
}

const WorldArrow = ({ tipX, tipY, a, quiver }) => (
  <g transform={`translate(${tipX - L * Math.cos(a)} ${tipY - L * Math.sin(a)}) rotate(${deg(a)})`}>
    <g className={quiver ? 'quiver' : ''}><ArrowShape /></g>
  </g>
)

const Backdrop = memo(function Backdrop() {
  return (
    <>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#140d38" /><stop offset="0.4" stopColor="#4a2a85" />
          <stop offset="0.72" stopColor="#ff7a59" /><stop offset="1" stopColor="#ffc98b" />
        </linearGradient>
        <radialGradient id="sun"><stop offset="0" stopColor="#fff1c9" /><stop offset="0.35" stopColor="#ffd08a" stopOpacity=".9" /><stop offset="1" stopColor="#ff9a62" stopOpacity="0" /></radialGradient>
        <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1d5a3a" /><stop offset="1" stopColor="#0a2417" /></linearGradient>
      </defs>
      <rect width="1000" height="500" fill="url(#sky)" />
      {STARS.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.6" fill="#fff" opacity=".8" />)}
      <circle cx="470" cy="380" r="230" fill="url(#sun)" />
      <circle cx="470" cy="380" r="62" fill="#fff1c9" />
      <path d="M0 360 L120 270 L230 340 L350 250 L480 350 L600 290 L720 360 L850 270 L1000 350 V500 H0Z" fill="#3a2377" opacity=".8" />
      <path d="M0 410 Q180 340 360 400 T720 395 T1000 380 V500 H0Z" fill="#241552" />
      {TREES.map(([x, y, s], i) => <path key={i} d={tree(x, y, s)} fill="#120a33" />)}
      <rect x={CX - 5} y="60" width="10" height="390" rx="5" fill="#5a3b22" />
      <rect x={CX - 40} y="436" width="80" height="14" rx="6" fill="#3f2816" />
    </>
  )
})

const Face = memo(function Face() {
  return (
    <>
      <circle cx={CX + 6} cy={CY + 9} r={R + 2} fill="#000" opacity=".3" />
      {RING.map((c, i) => <circle key={i} cx={CX} cy={CY} r={(10 - i) * STEP} fill={c} stroke="rgba(0,0,0,.4)" strokeWidth="1" />)}
      {RING.map((_, i) => {
        const s = i + 1
        const y = s === 10 ? CY + 3 : CY - (10.5 - s) * STEP + 3
        return <text key={s} x={CX} y={y} textAnchor="middle" fontSize={s === 10 ? 8 : 9} fontWeight="800" fill={DARK.includes(s) ? '#262637' : '#fff7e0'}>{s}</text>
      })}
    </>
  )
})

const Bird = ({ cls }) => (
  <div className={`bird ${cls}`}>
    <svg viewBox="0 0 40 20" width="100%" height="100%">
      <g className="wing wl"><path d="M20 10 Q11 -1 0 5 Q11 6 20 10Z" fill="#fff1e6" /></g>
      <g className="wing wr"><path d="M20 10 Q29 -1 40 5 Q29 6 20 10Z" fill="#fff1e6" /></g>
      <ellipse cx="20" cy="11" rx="3.2" ry="2.2" fill="#fff1e6" />
    </svg>
  </div>
)

const Sky = memo(function Sky() {
  return (
    <div className="sky-layer" aria-hidden="true">
      <div className="cloud c1"><i /></div>
      <div className="cloud c2"><i /></div>
      <div className="cloud c3"><i /></div>
      <div className="cloud c4"><i /></div>
      <Bird cls="b1" /><Bird cls="b2" /><Bird cls="b3" /><Bird cls="b4" /><Bird cls="b5" />
    </div>
  )
})

const Grass = memo(function Grass() { return <path d={GRASS} fill="url(#grass)" /> })

/* ---------- game ---------- */
export default function App() {
  const [phase, setPhase] = useState('intro') // intro | ready | fly | wait | over
  const [shots, setShots] = useState([])
  const [aim, setAim] = useState({ a: -0.3, p: 0 })
  const [dragging, setDragging] = useState(false)
  const [fx, setFx] = useState(null)       // short hit effect
  const [pop, setPop] = useState(null)     // floating score text
  const [fresh, setFresh] = useState(-1)   // index of the arrow that is still quivering
  const [hint, setHint] = useState('')
  const [newBest, setNewBest] = useState(false)
  const [best, setBest] = useState(() => {
    try { return Number(localStorage.getItem('dusk-range-best')) || 0 } catch { return 0 }
  })

  const svgRef = useRef(null)
  const targetRef = useRef(null)
  const flyRef = useRef(null)
  const trailRef = useRef(null)
  const flyArrowRef = useRef(null)
  const aimRef = useRef(aim)
  const shotsRef = useRef([])
  const bestRef = useRef(best)
  const timers = useRef([])
  const sim = useRef({ time: 0, amp: 0, arrow: null, drag: null })

  const updateAim = (n) => { aimRef.current = n; setAim(n) }
  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)) }
  const clearEffects = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setFx(null); setPop(null); setFresh(-1)
  }
  const total = shots.reduce((s, h) => s + h.pts, 0)

  /* ----- a shot has ended ----- */
  const land = (res) => {
    const s = sim.current
    s.arrow = null
    const next = [...shotsRef.current, res]
    shotsRef.current = next
    setShots(next)

    // effects are short and always removed again
    setPop({ key: Date.now(), x: res.x, y: Math.min(res.y, GROUND - 20), pts: res.pts })
    later(() => setPop(null), 1000)
    if (res.kind === 'target') {
      setFresh(next.length - 1)
      later(() => setFresh(-1), 650)
      if (res.pts > 0) {
        setFx({ key: Date.now(), x: CX, y: CY + res.dy, gold: res.pts >= 9 })
        later(() => setFx(null), 700)
      }
    }
    if (res.pts === 10) { beep(880, 0.45, 'sine', 0.14); later(() => beep(1320, 0.4, 'sine', 0.1), 120) }
    else beep(res.pts ? 160 : 90, 0.16, 'square', 0.1)

    if (next.length >= TOTAL) {
      setPhase('wait')
      later(() => {
        const sum = next.reduce((a, h) => a + h.pts, 0)
        if (sum > bestRef.current) {
          bestRef.current = sum; setBest(sum); setNewBest(true)
          try { localStorage.setItem('dusk-range-best', String(sum)) } catch { /* ignore */ }
        }
        setPhase('over')
      }, 1400)
    } else {
      s.amp = AMPS[next.length]
      updateAim({ ...aimRef.current, p: 0 })
      setHint(label(res.pts))
      setPhase('ready')
    }
  }

  /* ----- animation loop: writes straight to the DOM, no React re-render per frame ----- */
  useEffect(() => {
    if (!['ready', 'fly', 'wait'].includes(phase)) return
    let raf, last = performance.now()
    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.033)
      last = now
      const s = sim.current
      s.time += dt
      const ty = CY + s.amp * Math.sin(s.time * 1.6)
      if (targetRef.current) targetRef.current.setAttribute('transform', `translate(0 ${(ty - CY).toFixed(2)})`)

      const ar = s.arrow
      if (ar) {
        const px = ar.x, py = ar.y
        ar.vy += G * dt
        ar.x += ar.vx * dt
        ar.y += ar.vy * dt
        ar.a = Math.atan2(ar.vy, ar.vx)
        ar.trail.push(`${ar.x.toFixed(1)},${ar.y.toFixed(1)}`)
        if (ar.trail.length > 14) ar.trail.shift()

        if (!ar.passed && ar.x >= CX) {
          ar.passed = true
          const hy = py + (ar.y - py) * ((CX - px) / (ar.x - px))
          const d = Math.abs(hy - ty)
          if (d < R) land({ kind: 'target', dy: hy - ty, a: ar.a, pts: scoreAt(d), x: CX, y: hy })
        }
        if (s.arrow) {
          if (ar.y >= GROUND) land({ kind: 'ground', a: ar.a, pts: 0, x: ar.x, y: GROUND })
          else if (ar.x > 1060 || ar.y < -250) land({ kind: 'gone', pts: 0, x: clamp(ar.x, 40, 960), y: clamp(ar.y, 60, 400) })
        }
      }

      const cur = s.arrow
      if (flyRef.current) {
        if (cur) {
          flyRef.current.style.display = 'block'
          trailRef.current.setAttribute('points', cur.trail.join(' '))
          flyArrowRef.current.setAttribute('transform', `translate(${(cur.x - L * Math.cos(cur.a)).toFixed(1)} ${(cur.y - L * Math.sin(cur.a)).toFixed(1)}) rotate(${deg(cur.a).toFixed(1)})`)
        } else flyRef.current.style.display = 'none'
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [phase])

  /* ----- release the arrow ----- */
  const release = () => {
    const { a, p } = aimRef.current
    if (p < 0.2) { setHint('Pull back further to shoot'); return }
    clearEffects() // the previous hit animation stops before the new arrow flies
    const d0 = L - pullOf(p), v = p * VMAX
    sim.current.arrow = {
      x: PIV.x + Math.cos(a) * d0, y: PIV.y + Math.sin(a) * d0,
      vx: v * Math.cos(a), vy: v * Math.sin(a), a, trail: [], passed: false,
    }
    setHint('')
    setPhase('fly')
    beep(480 + p * 300, 0.3, 'sawtooth', 0.07)
  }

  /* ----- pointer: drag back to aim, let go to shoot ----- */
  const toSvg = (e) => {
    const r = svgRef.current.getBoundingClientRect()
    return { x: ((e.clientX - r.left) * 1000) / r.width, y: ((e.clientY - r.top) * 500) / r.height }
  }
  const onDown = (e) => {
    if (phase !== 'ready') return
    svgRef.current.setPointerCapture(e.pointerId)
    sim.current.drag = toSvg(e)
    setDragging(true)
    setHint('')
  }
  const onMove = (e) => {
    const d = sim.current.drag
    if (!d) return
    const c = toSvg(e)
    const dx = d.x - c.x, dy = d.y - c.y
    updateAim({ a: clamp(Math.atan2(dy, dx), -1.2, 0.45), p: Math.min(Math.hypot(dx, dy) / MAXPULL, 1) })
  }
  const onUp = () => {
    if (!sim.current.drag) return
    sim.current.drag = null
    setDragging(false)
    if (phase === 'ready') release()
  }

  /* ----- keyboard: arrows to aim, Space to shoot ----- */
  useEffect(() => {
    const onKey = (e) => {
      if (phase !== 'ready') return
      const { a, p } = aimRef.current
      if (e.code === 'ArrowUp') { e.preventDefault(); updateAim({ a: clamp(a - 0.03, -1.2, 0.45), p }) }
      else if (e.code === 'ArrowDown') { e.preventDefault(); updateAim({ a: clamp(a + 0.03, -1.2, 0.45), p }) }
      else if (e.code === 'ArrowRight') { e.preventDefault(); updateAim({ a, p: clamp(p + 0.04, 0, 1) }) }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); updateAim({ a, p: clamp(p - 0.04, 0, 1) }) }
      else if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); release() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])

  const start = () => {
    clearEffects()
    shotsRef.current = []
    sim.current = { time: 0, amp: AMPS[0], arrow: null, drag: null }
    setShots([]); setNewBest(false); setHint('')
    updateAim({ a: -0.3, p: 0 })
    setPhase('ready')
  }

  /* ----- derived drawing values ----- */
  const { a, p } = aim
  const pull = pullOf(p)
  const ready = phase === 'ready'
  const nock = { x: PIV.x - Math.cos(a) * pull, y: PIV.y - Math.sin(a) * pull }
  const stars = total >= 40 ? 3 : total >= 28 ? 2 : total >= 15 ? 1 : 0

  const dots = []
  if (ready && dragging && p > 0.05) {
    const d0 = L - pull, v = p * VMAX
    const sx = PIV.x + Math.cos(a) * d0, sy = PIV.y + Math.sin(a) * d0
    const vx = v * Math.cos(a), vy = v * Math.sin(a)
    const tMax = Math.min(((CX - sx) / vx) * 0.6, 0.6)
    for (let i = 1; i <= 10; i++) {
      const t = (tMax * i) / 10
      dots.push({ x: sx + vx * t, y: sy + vy * t + 0.5 * G * t * t, o: 0.95 - i * 0.07, r: 4.5 - i * 0.22 })
    }
  }

  return (
    <main className="app">
      <header className="hud">
        <div className="brand">
          <svg width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="15" fill="#fff7e0" /><circle cx="17" cy="17" r="10" fill="#e04848" /><circle cx="17" cy="17" r="5" fill="#ffd34d" /></svg>
          <div><h1>Archery challenge</h1></div>
        </div>
        <div className="quiver-bar" aria-label={`${TOTAL - shots.length} arrows left`}>
          {Array.from({ length: TOTAL }, (_, i) => (
            <svg key={i} className={i < shots.length ? 'used' : ''} width="46" height="14" viewBox="0 0 92 28"><g transform="translate(4 14) scale(.95)"><ArrowShape /></g></svg>
          ))}
        </div>
        <div className="scores">
          <div className="pill"><span>Score</span><b key={total} className="bump">{total}</b></div>
          <div className="pill"><span>Best</span><b>{best}</b></div>
        </div>
      </header>

      <section className="stage">
        <Sky />
        <svg ref={svgRef} viewBox="0 0 1000 500" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          role="img" aria-label="Archery range: drag back to aim, release to shoot">
          <Backdrop />

          {/* target: arrows are children of the wheel, so they stay exactly where they hit */}
          <g ref={targetRef}>
            <Face />
            {shots.map((h, i) => h.kind === 'target' && (
              <WorldArrow key={i} tipX={CX} tipY={CY + h.dy} a={h.a} quiver={i === fresh} />
            ))}
            {fx && (
              <g key={fx.key} transform={`translate(${fx.x} ${fx.y})`}>
                {SPARKS.map((s, i) => <circle key={i} className="spark" r="3" fill={fx.gold && i % 2 ? '#ffd34d' : '#fff7e0'} style={{ '--dx': `${s.dx}px`, '--dy': `${s.dy}px` }} />)}
                {fx.gold && <circle className="burst" r="20" fill="none" stroke="#ffd34d" strokeWidth="3" />}
              </g>
            )}
          </g>

          <Grass />
          {shots.map((h, i) => h.kind === 'ground' && <WorldArrow key={i} tipX={h.x} tipY={h.y + 6} a={h.a} />)}

          {/* archer */}
          <g fill="#0d0826" stroke="#0d0826">
            <line x1="108" y1="372" x2="98" y2="446" strokeWidth="11" strokeLinecap="round" />
            <line x1="124" y1="372" x2="136" y2="446" strokeWidth="11" strokeLinecap="round" />
            <rect x="98" y="302" width="34" height="76" rx="14" strokeWidth="0" />
            <circle cx="116" cy="282" r="15" strokeWidth="0" />
            <line x1="124" y1="318" x2={PIV.x} y2={PIV.y} strokeWidth="8" strokeLinecap="round" />
            <line x1="112" y1="318" x2={ready ? nock.x : 150} y2={ready ? nock.y : 350} strokeWidth="8" strokeLinecap="round" />
          </g>

          {/* bow */}
          <g transform={`translate(${PIV.x} ${PIV.y}) rotate(${deg(a)})`}>
            <path d="M0 -80 Q50 0 0 80" fill="none" stroke="#7a4a1f" strokeWidth="8" strokeLinecap="round" />
            <path d="M0 -80 Q50 0 0 80" fill="none" stroke="#d99a52" strokeWidth="2.5" strokeLinecap="round" />
            <polyline points={ready ? `0,-80 ${-pull},0 0,80` : '0,-80 -8,0 0,80'} fill="none" stroke="#fff7e0" strokeWidth="1.8" />
            {ready && <g transform={`translate(${-pull} 0)`}><ArrowShape /></g>}
          </g>

          {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#fff" opacity={d.o} />)}

          {/* flying arrow (moved directly by the loop) */}
          <g ref={flyRef} style={{ display: 'none' }}>
            <polyline ref={trailRef} fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="2.5" strokeLinecap="round" />
            <g ref={flyArrowRef}><ArrowShape /></g>
          </g>

          {pop && <text key={pop.key} className={`pop ${pop.pts === 10 ? 'gold' : ''}`} x={pop.x} y={pop.y - 20} textAnchor="middle">{pop.pts ? `+${pop.pts}` : 'Miss'}</text>}
        </svg>

        {phase === 'intro' && (
          <div className="overlay">
            <div className="card">
              <h2>Archery Challenge</h2>
              <ol className="how">
                <li><b>Drag back</b> anywhere, like pulling a bowstring.</li>
                <li><b>Aim</b> using the dotted path. Pull further for more power.</li>
                <li><b>Let go</b> to shoot. Every arrow stays where it lands.</li>
              </ol>
              <button className="btn" onClick={start}>Start shooting</button>
              <small>Keyboard: arrow keys to aim, Space to shoot</small>
            </div>
          </div>
        )}
        {phase === 'over' && (
          <div className="overlay">
            <div className="card">
              <div className="stars">{[0, 1, 2].map((i) => <span key={i} className={i < stars ? 'on' : ''}>★</span>)}</div>
              <h2>{stars === 3 ? 'Legendary!' : stars === 2 ? 'Sharp shooter' : stars === 1 ? 'Getting there' : 'Keep practising'}</h2>
              <div className="big">{total}<span> / {TOTAL * 10}</span></div>
              <p>{newBest ? 'New personal best!' : `Your best is ${best}.`}</p>
              <button className="btn" onClick={start}>Play again</button>
            </div>
          </div>
        )}
      </section>

      <footer className="dock">
        <div className="meter">
          <div className="meter-top"><span>Power</span><b>{Math.round(p * 100)}%</b><span className="ang">Angle</span><b>{Math.max(0, Math.round(-deg(a)))}°</b></div>
          <div className="bar"><i style={{ width: `${p * 100}%` }} /></div>
        </div>
        <div className="tip">{phase === 'ready' ? hint || 'Drag back anywhere, then let go to shoot' : phase === 'fly' ? 'Flying…' : ''}</div>
      </footer>
    </main>
  )
}
