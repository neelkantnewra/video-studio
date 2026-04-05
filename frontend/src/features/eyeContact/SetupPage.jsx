import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'

// ── Sound utility — plays a tone using Web Audio API (no files needed) ────────
function useSound() {
  const ctxRef = useRef(null)

  function getCtx() {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    return ctxRef.current
  }

  function playBeep({ frequency = 880, duration = 0.15, type = 'sine', gain = 0.4 }) {
    try {
      const ctx      = getCtx()
      const osc      = ctx.createOscillator()
      const gainNode = ctx.createGain()
      osc.connect(gainNode)
      gainNode.connect(ctx.destination)
      osc.type            = type
      osc.frequency.value = frequency
      gainNode.gain.setValueAtTime(gain, ctx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + duration)
    } catch (e) {
      console.warn('[sound] Web Audio not available')
    }
  }

  // Short tick — played every second during capture
  function tick() {
    playBeep({ frequency: 660, duration: 0.05, gain: 0.15 })
  }

  // Success chime — two ascending tones when step completes
  function success() {
    playBeep({ frequency: 523, duration: 0.12, gain: 0.3 })
    setTimeout(() => playBeep({ frequency: 784, duration: 0.2, gain: 0.4 }), 130)
    setTimeout(() => playBeep({ frequency: 1047, duration: 0.3, gain: 0.35 }), 280)
  }

  // Ready beep — before capture starts
  function ready() {
    playBeep({ frequency: 440, duration: 0.1, gain: 0.2 })
  }

  return { tick, success, ready }
}

// ── Gaze states for 3D face animation ────────────────────────────────────────
const GAZE_STATES = {
  at_camera:    { irisX: 0,     irisY: 0,     headY: 0,     headX: 0    },
  slightly_off: { irisX: 0.06,  irisY: -0.04, headY: 0.25,  headX: 0.1  },
  looking_away: { irisX: -0.12, irisY: 0.08,  headY: -0.6,  headX: 0.35 },
  idle:         { irisX: 0,     irisY: 0,     headY: 0,     headX: 0    },
}

const API_BASE = `http://${window.location.hostname}:8000`

const STEPS = [
  {
    id:          'welcome',
    title:       'Set up eye contact correction',
    subtitle:    'Takes about 2 minutes. Only needs to be done once.',
    instruction: null,
    target:      null,
    needed:      0,
    gazeState:   'idle',
    color:       'gray',
  },
  {
    id:          'at_camera',
    title:       'Look directly at your camera',
    subtitle:    'Step 1 of 3',
    instruction: 'Look straight at your webcam as if talking to someone on a video call. Stay natural — blink normally.',
    target:      'at_camera',
    needed:      150,
    gazeState:   'at_camera',
    color:       'green',
    hint:        '📷 Look at the camera lens, not the screen',
  },
  {
    id:          'slightly_off',
    title:       'Look around your screen',
    subtitle:    'Step 2 of 3',
    instruction: 'Look at different parts of your screen — top corners, sides, slightly down. Pretend you\'re reading slides.',
    target:      'slightly_off',
    needed:      150,
    gazeState:   'slightly_off',
    color:       'blue',
    hint:        '👀 Slowly scan around your screen edges',
  },
  {
    id:          'looking_away',
    title:       'Look clearly away',
    subtitle:    'Step 3 of 3',
    instruction: 'Look at your phone, keyboard, or something clearly off to the side.',
    target:      'looking_away',
    needed:      150,
    gazeState:   'looking_away',
    color:       'orange',
    hint:        '↗ Look at something away from your screen',
  },
  {
    id:          'saving',
    title:       'Saving your data',
    subtitle:    'Almost done...',
    instruction: null,
    target:      null,
    needed:      0,
    gazeState:   'at_camera',
    color:       'gray',
  },
]

const AUTO_FPS = 4

// ── 3D face component ─────────────────────────────────────────────────────────
function FacePreview({ gazeState = 'idle' }) {
  const mountRef = useRef(null)
  const sceneRef = useRef({})

  useEffect(() => {
    const el = mountRef.current
    if (!el) return
    const W = el.clientWidth
    const H = el.clientHeight

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(window.devicePixelRatio)
    el.appendChild(renderer.domElement)

    const scene  = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100)
    camera.position.set(0, 0, 5.5)

    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const dir = new THREE.DirectionalLight(0xffffff, 0.9)
    dir.position.set(2, 3, 4)
    scene.add(dir)

    const headGeo = new THREE.SphereGeometry(1.2, 48, 48)
    headGeo.scale(1, 1.18, 0.9)
    const head = new THREE.Mesh(
      headGeo,
      new THREE.MeshStandardMaterial({ color: 0xc8845a, roughness: 0.75 })
    )
    scene.add(head)

    function makeEyeball(x) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.21, 24, 24),
        new THREE.MeshStandardMaterial({ color: 0xf5f0e8, roughness: 0.2 })
      )
      m.position.set(x, 0.22, 1.02)
      scene.add(m)
    }

    function makeIris(x) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.10, 20, 20),
        new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.15 })
      )
      m.position.set(x, 0.22, 1.20)
      scene.add(m)
      return m
    }

    makeEyeball(-0.40)
    makeEyeball(0.40)
    const leftIris  = makeIris(-0.40)
    const rightIris = makeIris(0.40)

    const noseGeo = new THREE.SphereGeometry(0.10, 16, 16)
    noseGeo.scale(0.85, 0.65, 1.3)
    const nose = new THREE.Mesh(
      noseGeo,
      new THREE.MeshStandardMaterial({ color: 0xb87050, roughness: 0.9 })
    )
    nose.position.set(0, -0.18, 1.12)
    scene.add(nose)

    // Mouth
    const mouth = new THREE.Mesh(
      new THREE.TorusGeometry(0.18, 0.03, 8, 20, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x9a5535, roughness: 0.8 })
    )
    mouth.position.set(0, -0.52, 1.05)
    mouth.rotation.z = Math.PI
    scene.add(mouth)

    sceneRef.current = { renderer, scene, camera, leftIris, rightIris, head }

    let animId
    const loop = () => { animId = requestAnimationFrame(loop); renderer.render(scene, camera) }
    loop()

    return () => {
      cancelAnimationFrame(animId)
      renderer.dispose()
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
    }
  }, [])

  useEffect(() => {
    const { leftIris, rightIris, head } = sceneRef.current
    if (!leftIris || !rightIris || !head) return

    const target = GAZE_STATES[gazeState] || GAZE_STATES.idle
    const fromLX = leftIris.position.x,  fromLY = leftIris.position.y
    const fromRX = rightIris.position.x, fromRY = rightIris.position.y
    const fromHY = head.rotation.y,      fromHX = head.rotation.x

    let t = 0
    const id = setInterval(() => {
      t = Math.min(t + 0.04, 1)
      const e = 1 - Math.pow(1 - t, 3)
      leftIris.position.x  = fromLX + (-0.40 + target.irisX - fromLX) * e
      leftIris.position.y  = fromLY + ( 0.22 + target.irisY - fromLY) * e
      rightIris.position.x = fromRX + ( 0.40 + target.irisX - fromRX) * e
      rightIris.position.y = fromRY + ( 0.22 + target.irisY - fromRY) * e
      head.rotation.y      = fromHY + (target.headY - fromHY) * e
      head.rotation.x      = fromHX + (target.headX - fromHX) * e
      if (t >= 1) clearInterval(id)
    }, 16)

    return () => clearInterval(id)
  }, [gazeState])

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
}

// ── Main SetupPage ────────────────────────────────────────────────────────────
export default function SetupPage() {
  const navigate  = useNavigate()
  const videoRef  = useRef(null)
  const streamRef = useRef(null)
  const timerRef  = useRef(null)
  const sound     = useSound()

  const [stepIdx,     setStepIdx]     = useState(0)
  const [capturing,   setCapturing]   = useState(false)
  const [counts,      setCounts]      = useState({ at_camera: 0, slightly_off: 0, looking_away: 0 })
  const [frames,      setFrames]      = useState({ at_camera: [], slightly_off: [], looking_away: [] })
  const [saveStatus,  setSaveStatus]  = useState(null)   // null | 'saving' | 'done' | 'error'
  const [saveMsg,     setSaveMsg]     = useState('')
  const [countdown,   setCountdown]   = useState(null)   // 3, 2, 1, null
  const [justDone,    setJustDone]    = useState(false)  // flash when step completes

  const step   = STEPS[stepIdx]
  const isLast = stepIdx === STEPS.length - 1

  // ── Start webcam ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) return
    navigator.mediaDevices
      .getUserMedia({ video: { width: 1280, height: 720 } })
      .then(stream => {
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(err => console.error('[setup] Webcam error:', err))
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      clearInterval(timerRef.current)
    }
  }, [])

  // ── Capture one frame ──────────────────────────────────────────────────────
  const captureFrame = useCallback(() => {
    const video = videoRef.current
    const label = step.target
    if (!video || !label) return

    const canvas = document.createElement('canvas')
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)

    canvas.toBlob(blob => {
      if (!blob) return
      setFrames(prev => ({ ...prev, [label]: [...prev[label], blob] }))
      setCounts(prev => ({ ...prev, [label]: prev[label] + 1 }))
    }, 'image/jpeg', 0.85)
  }, [step.target])

  // ── Auto-capture loop ──────────────────────────────────────────────────────
  useEffect(() => {
    if (capturing && step.target) {
      timerRef.current = setInterval(captureFrame, 1000 / AUTO_FPS)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [capturing, captureFrame, step.target])

  // ── Detect step completion ─────────────────────────────────────────────────
  useEffect(() => {
    if (!step.target) return
    const count = counts[step.target]
    if (count >= step.needed && count > 0 && capturing) {
      // Step just completed
      setCapturing(false)
      setJustDone(true)
      sound.success()   // 🔔 Play success chime!

      setTimeout(() => setJustDone(false), 2000)
    }
  }, [counts, step, capturing])

  // ── Countdown before capture starts ───────────────────────────────────────
  function startWithCountdown() {
    setCountdown(3)
    sound.ready()

    const tick = (n) => {
      if (n <= 0) {
        setCountdown(null)
        setCapturing(true)
        return
      }
      setTimeout(() => {
        setCountdown(n - 1)
        sound.tick()
        tick(n - 1)
      }, 1000)
    }
    tick(3)
  }

  function handleNext() {
    setCapturing(false)
    if (stepIdx === STEPS.length - 2) {
      setStepIdx(STEPS.length - 1)
      handleSave()
    } else {
      setStepIdx(i => i + 1)
    }
  }

  async function handleSave() {
    setSaveStatus('saving')
    setSaveMsg('Saving frames...')
    try {
      const formData = new FormData()
      for (const [label, blobs] of Object.entries(frames)) {
        blobs.forEach((blob, i) => {
          formData.append('frames', new File([blob], `${label}_${i}.jpg`))
          formData.append('labels', label)
        })
      }
      const res = await fetch(`${API_BASE}/api/v1/eye-contact/save-samples`, {
        method: 'POST',
        body:   formData,
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setSaveStatus('done')
      setSaveMsg(`✅ Saved ${data.total} frames as session ${data.session_id}`)
      sound.success()
    } catch (err) {
      setSaveStatus('error')
      setSaveMsg(`Failed: ${err.message}`)
    }
  }

  const captureCount = step.target ? counts[step.target] : 0
  const progress     = step.needed ? Math.min(captureCount / step.needed, 1) : 0
  const isReady      = step.needed ? captureCount >= step.needed : true

  const stepColors = {
    green:  { bar: 'bg-green-500',  btn: 'bg-green-600 hover:bg-green-500',  ring: 'ring-green-500'  },
    blue:   { bar: 'bg-blue-500',   btn: 'bg-blue-600 hover:bg-blue-500',    ring: 'ring-blue-500'   },
    orange: { bar: 'bg-orange-500', btn: 'bg-orange-600 hover:bg-orange-500', ring: 'ring-orange-500' },
    gray:   { bar: 'bg-gray-500',   btn: 'bg-gray-900 hover:bg-gray-700',    ring: 'ring-gray-500'   },
  }
  const colors = stepColors[step.color] || stepColors.gray

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">

      {/* ── LEFT — webcam feed ─────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="relative w-full max-w-2xl aspect-video
                        rounded-2xl overflow-hidden bg-black shadow-2xl">
          <video
            ref={videoRef}
            autoPlay muted playsInline
            className="w-full h-full object-cover"
          />

          {/* Recording indicator */}
          {capturing && (
            <div className="absolute top-4 right-4 flex items-center gap-2
                            bg-black/60 rounded-full px-3 py-1.5 backdrop-blur-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-xs font-medium">Recording</span>
            </div>
          )}

          {/* Countdown overlay */}
          {countdown !== null && countdown > 0 && (
            <div className="absolute inset-0 flex items-center justify-center
                            bg-black/40 backdrop-blur-sm">
              <div className="text-white text-8xl font-bold
                              animate-ping-once select-none">
                {countdown}
              </div>
            </div>
          )}

          {/* Step done flash */}
          {justDone && (
            <div className="absolute inset-0 flex items-center justify-center
                            bg-green-500/20 backdrop-blur-sm">
              <div className="bg-green-500 text-white rounded-2xl px-8 py-4
                              text-center shadow-2xl">
                <p className="text-3xl mb-1">✅</p>
                <p className="text-lg font-bold">Step complete!</p>
                <p className="text-sm opacity-80">Click Next to continue</p>
              </div>
            </div>
          )}

          {/* Progress bar at bottom of webcam */}
          {step.target && (
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <div className="bg-black/50 rounded-xl px-3 py-2 backdrop-blur-sm">
                <div className="flex justify-between text-xs text-white/70 mb-1.5">
                  <span>{step.hint}</span>
                  <span>{captureCount} / {step.needed}</span>
                </div>
                <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-200
                      ${isReady ? 'bg-green-400' : colors.bar}`}
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT — instruction panel ──────────────────────────────────── */}
      <div className="w-96 shrink-0 bg-white flex flex-col overflow-y-auto">

        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4
                        border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-400
                           uppercase tracking-wider">
            Eye Contact Setup
          </span>
          <button
            onClick={() => navigate('/')}
            className="text-xs text-gray-400 hover:text-gray-600 transition"
          >
            ✕ Cancel
          </button>
        </div>

        {/* Step dots */}
        <div className="flex gap-1.5 px-6 pt-5">
          {STEPS.slice(1, -1).map((s, i) => (
            <div
              key={s.id}
              className="h-1 flex-1 rounded-full transition-all duration-500"
              style={{
                background: i < stepIdx
                  ? '#111'
                  : i === stepIdx - 1
                  ? '#111'
                  : '#e5e7eb'
              }}
            />
          ))}
        </div>

        {/* 3D face */}
        <div className="flex justify-center py-5">
          <div className="w-36 h-36 rounded-full overflow-hidden
                          bg-gray-100 border border-gray-200">
            <FacePreview gazeState={step.gazeState} />
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 flex flex-col px-6 pb-6 gap-5">

          <div>
            <p className="text-xs text-gray-400 mb-1">{step.subtitle}</p>
            <h2 className="text-lg font-semibold text-gray-900">
              {step.title}
            </h2>
          </div>

          {/* ── Welcome ── */}
          {step.id === 'welcome' && (
            <>
              <p className="text-sm text-gray-500 leading-relaxed">
                We'll capture a few seconds of your face looking in three
                different directions. A <strong>sound will play</strong> when
                each step is complete so you don't have to watch the screen.
              </p>
              <p className="text-sm text-gray-500 leading-relaxed">
                The 3D face shows exactly where to look. A countdown will
                start before each capture begins.
              </p>
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <p className="text-xs font-semibold text-gray-600 mb-2">
                  What to expect:
                </p>
                <div className="flex flex-col gap-1.5">
                  {[
                    { icon: '🔢', text: '3-second countdown before each step' },
                    { icon: '🔔', text: 'Chime sound when step is complete' },
                    { icon: '📷', text: 'Progress bar shows on the webcam feed' },
                    { icon: '⏱️', text: 'About 2 minutes total' },
                  ].map(({ icon, text }) => (
                    <div key={text} className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{icon}</span>
                      <span>{text}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={handleNext}
                className="mt-auto w-full bg-gray-900 text-white text-sm
                           font-medium rounded-xl py-3 hover:bg-gray-700
                           transition-colors"
              >
                Get started →
              </button>
            </>
          )}

          {/* ── Capture steps ── */}
          {step.target && (
            <>
              <p className="text-sm text-gray-500 leading-relaxed">
                {step.instruction}
              </p>

              {/* Progress */}
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-2">
                  <span>Frames captured</span>
                  <span className={isReady ? 'text-green-600 font-semibold' : ''}>
                    {captureCount} / {step.needed}
                    {isReady ? ' ✓' : ''}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-200
                      ${isReady ? 'bg-green-500' : colors.bar}`}
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
              </div>

              {/* Sound indicator */}
              <div className="flex items-center gap-2 text-xs text-gray-400
                              bg-gray-50 rounded-lg px-3 py-2 border
                              border-gray-100">
                <span>🔔</span>
                <span>A chime will play when this step is complete</span>
              </div>

              {/* Capture button */}
              {!isReady && (
                <button
                  onClick={() => {
                    if (capturing) {
                      setCapturing(false)
                      setCountdown(null)
                    } else {
                      startWithCountdown()
                    }
                  }}
                  disabled={countdown !== null && countdown > 0}
                  className={`w-full text-sm font-medium rounded-xl py-3
                              transition-colors
                    ${capturing
                      ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                      : countdown !== null
                      ? 'bg-gray-100 text-gray-400 cursor-wait'
                      : `text-white ${colors.btn}`}`}
                >
                  {capturing
                    ? '⏸ Pause'
                    : countdown !== null && countdown > 0
                    ? `Starting in ${countdown}...`
                    : '▶ Start capturing'}
                </button>
              )}

              {/* Next button */}
              {isReady && (
                <button
                  onClick={handleNext}
                  className="w-full bg-gray-900 text-white text-sm font-medium
                             rounded-xl py-3 hover:bg-gray-700 transition-colors"
                >
                  {stepIdx === STEPS.length - 2 ? 'Save & finish →' : 'Next step →'}
                </button>
              )}
            </>
          )}

          {/* ── Saving step ── */}
          {step.id === 'saving' && (
            <>
              {saveStatus === 'saving' && (
                <div className="flex flex-col gap-3">
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gray-900 rounded-full animate-pulse w-3/4" />
                  </div>
                  <p className="text-sm text-gray-500">{saveMsg}</p>
                </div>
              )}

              {saveStatus === 'done' && (
                <>
                  <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                    <p className="text-sm font-semibold text-green-700 mb-1">
                      ✅ Frames saved!
                    </p>
                    <p className="text-xs text-green-600 leading-relaxed">
                      {saveMsg}
                    </p>
                  </div>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Now go to Annotation Studio to label your frames and
                    build your training dataset.
                  </p>
                  <button
                    onClick={() => navigate('/annotate')}
                    className="w-full bg-gray-900 text-white text-sm font-medium
                               rounded-xl py-3 hover:bg-gray-700 transition-colors"
                  >
                    Annotate frames →
                  </button>
                  <button
                    onClick={() => navigate('/')}
                    className="w-full border border-gray-200 text-gray-600
                               text-sm rounded-xl py-3 hover:bg-gray-50
                               transition-colors"
                  >
                    Back to editor
                  </button>
                </>
              )}

              {saveStatus === 'error' && (
                <>
                  <p className="text-sm text-red-500">{saveMsg}</p>
                  <button
                    onClick={() => setStepIdx(0)}
                    className="w-full border border-gray-200 text-sm
                               rounded-xl py-3 hover:bg-gray-50"
                  >
                    Start over
                  </button>
                </>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  )
}