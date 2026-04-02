import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'

// ── Gaze targets for each capture step ───────────────────────
const GAZE_STATES = {
  at_camera:    { irisX: 0,     irisY: 0,     headY: 0,    headX: 0    },
  slightly_off: { irisX: 0.06,  irisY: -0.04, headY: 0.25, headX: 0.1  },
  looking_away: { irisX: -0.12, irisY: 0.08,  headY: -0.6, headX: 0.35 },
  idle:         { irisX: 0,     irisY: 0,     headY: 0,    headX: 0    },
}

const API_BASE = `http://${window.location.hostname}:8000`

const STEPS = [
  {
    id: 'welcome',
    title: 'Set up eye contact correction',
    subtitle: 'Takes about 2 minutes. Only needs to be done once.',
    instruction: null,
    target: null,
    needed: 0,
    gazeState: 'idle',
  },
  {
    id: 'at_camera',
    title: 'Look directly at your camera',
    subtitle: 'Step 1 of 3',
    instruction: 'Look straight at your webcam as if you\'re talking to someone on a video call. Move your head slightly, blink naturally.',
    target: 'at_camera',
    needed: 150,
    gazeState: 'at_camera',
  },
  {
    id: 'slightly_off',
    title: 'Look around your screen',
    subtitle: 'Step 2 of 3',
    instruction: 'Look at different parts of your screen — top corners, sides, slightly down. Pretend you\'re reading slides or notes.',
    target: 'slightly_off',
    needed: 150,
    gazeState: 'slightly_off',
  },
  {
    id: 'looking_away',
    title: 'Look clearly away',
    subtitle: 'Step 3 of 3',
    instruction: 'Look at your phone, keyboard, or something off to the side — anything clearly away from the camera.',
    target: 'looking_away',
    needed: 150,
    gazeState: 'looking_away',
  },
  {
    id: 'training',
    title: 'Training your model',
    subtitle: 'Running locally on your machine',
    instruction: null,
    target: null,
    needed: 0,
    gazeState: 'at_camera',
  },
]

const AUTO_FPS = 4

// ── Three.js face component ───────────────────────────────────
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
    const fill = new THREE.DirectionalLight(0xffffff, 0.3)
    fill.position.set(-2, -1, 2)
    scene.add(fill)

    // Head
    const headGeo = new THREE.SphereGeometry(1.2, 48, 48)
    headGeo.scale(1, 1.18, 0.9)
    const headMat = new THREE.MeshStandardMaterial({ color: 0xc8845a, roughness: 0.75, metalness: 0.05 })
    const head    = new THREE.Mesh(headGeo, headMat)
    scene.add(head)

    // Eyeballs
    function makeEyeball(x) {
      const g = new THREE.SphereGeometry(0.21, 24, 24)
      const m = new THREE.MeshStandardMaterial({ color: 0xf5f0e8, roughness: 0.2 })
      const mesh = new THREE.Mesh(g, m)
      mesh.position.set(x, 0.22, 1.02)
      scene.add(mesh)
      return mesh
    }

    // Iris
    function makeIris(x) {
      const g = new THREE.SphereGeometry(0.10, 20, 20)
      const m = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.15 })
      const mesh = new THREE.Mesh(g, m)
      mesh.position.set(x, 0.22, 1.20)
      scene.add(mesh)
      return mesh
    }

    // Pupil highlight
    function makeHighlight(x) {
      const g = new THREE.SphereGeometry(0.03, 10, 10)
      const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.0, metalness: 0.5 })
      const mesh = new THREE.Mesh(g, m)
      mesh.position.set(x + 0.03, 0.26, 1.26)
      scene.add(mesh)
      return mesh
    }

    makeEyeball(-0.40)
    makeEyeball(0.40)
    const leftIris  = makeIris(-0.40)
    const rightIris = makeIris(0.40)
    makeHighlight(-0.40)
    makeHighlight(0.40)

    // Nose
    const noseGeo = new THREE.SphereGeometry(0.10, 16, 16)
    noseGeo.scale(0.85, 0.65, 1.3)
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xb87050, roughness: 0.9 })
    const nose    = new THREE.Mesh(noseGeo, noseMat)
    nose.position.set(0, -0.18, 1.12)
    scene.add(nose)

    // Mouth — simple curve
    const mouthGeo = new THREE.TorusGeometry(0.18, 0.03, 8, 20, Math.PI)
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0x9a5535, roughness: 0.8 })
    const mouth    = new THREE.Mesh(mouthGeo, mouthMat)
    mouth.position.set(0, -0.52, 1.05)
    mouth.rotation.z = Math.PI
    scene.add(mouth)

    sceneRef.current = { renderer, scene, camera, leftIris, rightIris, head }

    let animId
    const loop = () => {
      animId = requestAnimationFrame(loop)
      renderer.render(scene, camera)
    }
    loop()

    return () => {
      cancelAnimationFrame(animId)
      renderer.dispose()
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
    }
  }, [])

  // Animate to new gaze state
  useEffect(() => {
    const { leftIris, rightIris, head } = sceneRef.current
    if (!leftIris || !rightIris || !head) return

    const target = GAZE_STATES[gazeState] || GAZE_STATES.idle

    const fromLX = leftIris.position.x
    const fromLY = leftIris.position.y
    const fromRX = rightIris.position.x
    const fromRY = rightIris.position.y
    const fromHY = head.rotation.y
    const fromHX = head.rotation.x

    const toLX = -0.40 + target.irisX
    const toLY =  0.22 + target.irisY
    const toRX =  0.40 + target.irisX
    const toRY =  0.22 + target.irisY

    let t = 0
    const interval = setInterval(() => {
      t = Math.min(t + 0.04, 1)
      const e = 1 - Math.pow(1 - t, 3) // ease out cubic

      leftIris.position.x  = fromLX + (toLX - fromLX) * e
      leftIris.position.y  = fromLY + (toLY - fromLY) * e
      rightIris.position.x = fromRX + (toRX - fromRX) * e
      rightIris.position.y = fromRY + (toRY - fromRY) * e
      head.rotation.y      = fromHY + (target.headY - fromHY) * e
      head.rotation.x      = fromHX + (target.headX - fromHX) * e

      if (t >= 1) clearInterval(interval)
    }, 16)

    return () => clearInterval(interval)
  }, [gazeState])

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
}

// ── Main SetupPage ────────────────────────────────────────────
export default function SetupPage() {
  const navigate  = useNavigate()
  const videoRef  = useRef(null)
  const streamRef = useRef(null)
  const timerRef  = useRef(null)

  const [stepIdx,     setStepIdx]     = useState(0)
  const [capturing,   setCapturing]   = useState(false)
  const [counts,      setCounts]      = useState({ at_camera: 0, slightly_off: 0, looking_away: 0 })
  const [frames,      setFrames]      = useState({ at_camera: [], slightly_off: [], looking_away: [] })
  const [trainStatus, setTrainStatus] = useState(null)
  const [trainMsg,    setTrainMsg]    = useState('')

  const step    = STEPS[stepIdx]
  const isLast  = stepIdx === STEPS.length - 1

  // Start webcam
useEffect(() => {
  if (!navigator.mediaDevices?.getUserMedia) {
    console.warn('[setup] Camera blocked — needs HTTPS or localhost')
    return  // ← exits gracefully instead of crashing
  }

  navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } })
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

  const captureFrame = useCallback(() => {
    const video = videoRef.current
    const label = step.target
    if (!video || !label) return

    const canvas  = document.createElement('canvas')
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)

    canvas.toBlob(blob => {
      if (!blob) return
      setFrames(prev => ({ ...prev, [label]: [...prev[label], blob] }))
      setCounts(prev => ({ ...prev, [label]: prev[label] + 1 }))
    }, 'image/jpeg', 0.85)
  }, [step.target])

  // Auto-capture loop
  useEffect(() => {
    if (capturing && step.target) {
      timerRef.current = setInterval(captureFrame, 1000 / AUTO_FPS)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [capturing, captureFrame, step.target])

  // Auto-stop when enough frames
  useEffect(() => {
    if (step.target && counts[step.target] >= step.needed) {
      setCapturing(false)
    }
  }, [counts, step])

  function handleNext() {
    setCapturing(false)
    // Last capture step → go to training step and auto-train
    if (stepIdx === STEPS.length - 2) {
      setStepIdx(STEPS.length - 1)
      handleSave()
    } else {
      setStepIdx(i => i + 1)
    }
  }

async function handleSave() {
  setTrainStatus('training')  // reuse state, just means "busy"
  setTrainMsg('Saving frames to disk...')

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
      body: formData,
    })

    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()

    setTrainStatus('done')
    setTrainMsg(`Saved ${data.total} frames. Upload tests/samples/frames/ to Kaggle to train.`)
  } catch (err) {
    setTrainStatus('error')
    setTrainMsg(`Failed: ${err.message}`)
  }
}

  const captureCount = step.target ? counts[step.target] : 0
  const progress     = step.needed  ? Math.min(captureCount / step.needed, 1) : 0
  const isReady      = step.needed  ? captureCount >= step.needed : true

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* LEFT — webcam feed */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-900">
        <div className="relative w-full max-w-2xl aspect-video rounded-2xl overflow-hidden bg-black">
          <video
            ref={videoRef}
            autoPlay muted playsInline
            className="w-full h-full object-cover"
          />
          {/* Recording indicator */}
          {capturing && (
            <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/50 rounded-full px-3 py-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-xs font-medium">Capturing</span>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — instructions panel */}
      <div className="w-96 shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-y-auto">

        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Eye Contact Setup
          </span>
          <button
            onClick={() => navigate('/')}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            ✕ Cancel
          </button>
        </div>

        {/* Step progress bar */}
        <div className="flex gap-1.5 px-6 pt-5">
          {STEPS.slice(1, -1).map((s, i) => (
            <div
              key={s.id}
              className="h-1 flex-1 rounded-full transition-colors duration-500"
              style={{ background: i < stepIdx ? '#111' : '#e5e7eb' }}
            />
          ))}
        </div>

        {/* 3D face */}
        <div className="flex justify-center py-6">
          <div className="w-44 h-44 rounded-full overflow-hidden bg-gray-100 border border-gray-200">
            <FacePreview gazeState={step.gazeState} />
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 flex flex-col px-6 pb-6 gap-4">

          <div>
            <p className="text-xs text-gray-400 mb-1">{step.subtitle}</p>
            <h2 className="text-lg font-medium text-gray-900">{step.title}</h2>
          </div>

          {/* Welcome */}
          {step.id === 'welcome' && (
            <>
              <p className="text-sm text-gray-500 leading-relaxed">
                We'll capture a few seconds of your face looking in three different directions. This trains a small model personalized to your face, camera, and lighting.
              </p>
              <p className="text-sm text-gray-500 leading-relaxed">
                The 3D face above will show you exactly where to look for each step.
              </p>
              <button
                onClick={handleNext}
                className="mt-auto w-full bg-gray-900 text-white text-sm rounded-xl py-3 hover:bg-gray-700 transition-colors"
              >
                Get started →
              </button>
            </>
          )}

          {/* Capture steps */}
          {step.target && (
            <>
              <p className="text-sm text-gray-500 leading-relaxed">
                {step.instruction}
              </p>

              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-2">
                  <span>Frames captured</span>
                  <span>{captureCount} / {step.needed}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{
                      width: `${progress * 100}%`,
                      background: isReady ? '#16a34a' : '#111'
                    }}
                  />
                </div>
              </div>

              <button
                onClick={() => setCapturing(c => !c)}
                disabled={isReady}
                className={`w-full text-sm rounded-xl py-3 transition-colors ${
                  capturing
                    ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                    : isReady
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-900 text-white hover:bg-gray-700'
                }`}
              >
                {capturing ? 'Pause' : isReady ? '✓ Done' : 'Start capturing'}
              </button>

              {isReady && (
                <button
                  onClick={handleNext}
                  className="w-full bg-gray-900 text-white text-sm rounded-xl py-3 hover:bg-gray-700 transition-colors"
                >
                  {stepIdx === STEPS.length - 2 ? 'Train model →' : 'Next →'}
                </button>
              )}
            </>
          )}

          {/* Training step */}
          {step.id === 'training' && (
            <>
              {trainStatus === 'training' && (
                <div className="flex flex-col gap-3">
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gray-900 rounded-full animate-pulse w-3/4" />
                  </div>
                  <p className="text-sm text-gray-500">{trainMsg}</p>
                </div>
              )}
              {trainStatus === 'done' && (
                <>
                  <p className="text-sm text-green-600 font-medium">{trainMsg}</p>
                  <p className="text-sm text-gray-500">
                    Eye contact correction is now personalized to your face and ready to use.
                  </p>
                  <button
                    onClick={() => navigate('/')}
                    className="mt-auto w-full bg-gray-900 text-white text-sm rounded-xl py-3 hover:bg-gray-700 transition-colors"
                  >
                    Back to editor →
                  </button>
                </>
              )}
              {trainStatus === 'error' && (
                <>
                  <p className="text-sm text-red-500">{trainMsg}</p>
                  <button
                    onClick={() => setStepIdx(0)}
                    className="w-full border border-gray-200 text-sm rounded-xl py-3 hover:bg-gray-50"
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