import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'
import useAppStore from '../store/useAppStore'
import Header from '../components/Header.jsx'
import FeatureToggles from '../components/FeatureToggles.jsx'
import VideoUpload from '../components/VideoUpload.jsx'
import ColorPicker from '../components/ColorPicker.jsx'
import ProcessButton from '../components/ProcessButton.jsx'
import ProgressBar from '../components/ProgressBar.jsx'
import ResultPreview from '../components/ResultPreview.jsx'
import ProcessingMode from '../components/ProcessingMode.jsx'

const API_BASE = `http://${window.location.hostname}:8000`

// ── Tiny self-contained 3D face ───────────────────────────────────────────────
function MiniGazeFace({ trained }) {
  const mountRef = useRef(null)
  const sceneRef = useRef({})
  const [gazeIdx, setGazeIdx] = useState(0)

  const STATES = [
    { x: 0, y: 0 },      // at camera
    { x: 0.3, y: 0.15 }, // slightly off
    { x: -0.6, y: 0.4 }, // looking away
  ]

  useEffect(() => {
    if (trained) return
    const id = setInterval(() => {
      setGazeIdx(i => (i + 1) % STATES.length)
    }, 1800)
    return () => clearInterval(id)
  }, [trained])

  useEffect(() => {
    const el = mountRef.current
    if (!el) return

    const W = el.clientWidth
    const H = el.clientHeight
    if (W === 0 || H === 0) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(window.devicePixelRatio)
    el.appendChild(renderer.domElement)

    const scene  = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100)
    camera.position.set(0, 0, 5)

    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dir = new THREE.DirectionalLight(0xffffff, 0.8)
    dir.position.set(2, 3, 4)
    scene.add(dir)

    // Head
    const headGeo = new THREE.SphereGeometry(1.2, 32, 32)
    headGeo.scale(1, 1.15, 0.88)
    const head = new THREE.Mesh(
      headGeo,
      new THREE.MeshStandardMaterial({ color: 0xd4956a, roughness: 0.8 })
    )
    scene.add(head)

    // Eyes
    function makeEyeball(x) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
      )
      m.position.set(x, 0.18, 1.0)
      scene.add(m)
    }

    function makeIris(x) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.2 })
      )
      m.position.set(x, 0.18, 1.18)
      scene.add(m)
      return m
    }

    makeEyeball(-0.38)
    makeEyeball(0.38)
    const leftIris  = makeIris(-0.38)
    const rightIris = makeIris(0.38)

    // Nose
    const noseGeo = new THREE.SphereGeometry(0.1, 12, 12)
    noseGeo.scale(1, 0.7, 1.2)
    const nose = new THREE.Mesh(
      noseGeo,
      new THREE.MeshStandardMaterial({ color: 0xc4855a, roughness: 0.9 })
    )
    nose.position.set(0, -0.2, 1.1)
    scene.add(nose)

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

  // Animate iris to gaze state
  useEffect(() => {
    const { leftIris, rightIris, head } = sceneRef.current
    if (!leftIris) return

    const target = trained ? { x: 0, y: 0 } : (STATES[gazeIdx] || STATES[0])
    let t = 0
    const fromLX = leftIris.position.x
    const fromLY = leftIris.position.y
    const fromRX = rightIris.position.x
    const fromRY = rightIris.position.y
    const toLX = -0.38 + target.y * 0.15
    const toLY =  0.18 - target.x * 0.08
    const toRX =  0.38 + target.y * 0.15
    const toRY =  0.18 - target.x * 0.08

    const id = setInterval(() => {
      t = Math.min(t + 0.06, 1)
      const e = 1 - Math.pow(1 - t, 3)
      leftIris.position.x  = fromLX + (toLX - fromLX) * e
      leftIris.position.y  = fromLY + (toLY - fromLY) * e
      rightIris.position.x = fromRX + (toRX - fromRX) * e
      rightIris.position.y = fromRY + (toRY - fromRY) * e
      head.rotation.y      = -(target.y || 0) * 0.3
      head.rotation.x      =  (target.x || 0) * 0.2
      if (t >= 1) clearInterval(id)
    }, 16)

    return () => clearInterval(id)
  }, [gazeIdx, trained])

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
}

// ── Right sidebar ─────────────────────────────────────────────────────────────
function RightSidebar() {
  const navigate  = useNavigate()
  const [trained, setTrained] = useState(false)

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/eye-contact/status`)
      .then(r => r.json())
      .then(d => setTrained(d.trained))
      .catch(() => {})
  }, [])

  return (
    <div className="w-72 shrink-0 flex flex-col bg-white
                    border-l border-gray-200 overflow-y-auto">

      {/* ── Eye Contact section ───────────────────────────────────────── */}
      <div className="p-6 flex flex-col gap-4">

        <p className="text-[11px] font-semibold text-gray-400
                      uppercase tracking-widest">
          Eye Contact
        </p>

        {/* Status pill */}
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0
            ${trained ? 'bg-green-500' : 'bg-gray-300'}`}
          />
          <span className="text-xs text-gray-500">
            {trained ? 'Model ready — personalized to your face' : 'Not configured yet'}
          </span>
        </div>

        {/* 3D face preview */}
        <div className="w-full aspect-square max-w-[140px] mx-auto
                        rounded-2xl overflow-hidden bg-gray-100
                        border border-gray-200">
          <MiniGazeFace trained={trained} />
        </div>

        {/* Text */}
        <div>
          <p className="text-sm font-semibold text-gray-800 mb-1">
            {trained ? 'Eye contact correction active' : 'Set up gaze correction'}
          </p>
          <p className="text-xs text-gray-400 leading-relaxed">
            {trained
              ? 'Your model is ready. Apply it when processing video.'
              : 'Takes 2 minutes. Captures your gaze to train a model personalized to your face.'
            }
          </p>
        </div>

        {/* CTA */}
        <button
          onClick={() => navigate('/setup/eye-contact')}
          className="w-full bg-gray-900 text-white text-sm font-medium
                     rounded-xl py-2.5 hover:bg-gray-700 transition-colors"
        >
          {trained ? 'Recalibrate →' : 'Set up eye contact →'}
        </button>

      </div>

      {/* Divider */}
      <div className="h-px bg-gray-100 mx-6" />

      {/* ── Dataset Tools section ─────────────────────────────────────── */}
      <div className="p-6 flex flex-col gap-4">

        <p className="text-[11px] font-semibold text-gray-400
                      uppercase tracking-widest">
          Dataset Tools
        </p>

        {/* Annotation card */}
        <button
          onClick={() => navigate('/annotate')}
          className="w-full text-left rounded-2xl border border-gray-200
                     p-4 hover:border-gray-300 hover:bg-gray-50
                     transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gray-100
                            flex items-center justify-center text-lg
                            group-hover:bg-gray-200 transition-colors
                            flex-shrink-0">
              🏷️
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">
                Annotation Studio
              </p>
              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                Label captured frames to build your training dataset.
              </p>
            </div>
            <span className="text-gray-300 group-hover:text-gray-600
                             transition-colors text-lg">
              →
            </span>
          </div>
        </button>

      </div>

    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const videoUrl  = useAppStore((s) => s.videoUrl)
  const jobStatus = useAppStore((s) => s.jobStatus)
  const features  = useAppStore((s) => s.features)

  const hasVideo     = !!videoUrl
  const isProcessing = jobStatus === 'queued' || jobStatus === 'processing'
  const isDone       = jobStatus === 'done'
  const isUploading  = jobStatus === 'uploading'

  return (
    <div className="flex flex-col h-screen bg-gray-50">

      <Header />

      {!hasVideo ? (
        <div className="flex flex-1 overflow-hidden">

          {/* Left — drop zone */}
          <div className="flex-1 flex items-center justify-center p-8">
            <VideoUpload />
          </div>

          {/* Right — sidebar */}
          <RightSidebar />

        </div>

      ) : (
        <div className="flex flex-1 overflow-hidden">

          {/* Left panel */}
          <aside className="w-72 shrink-0 bg-white border-r border-gray-200
                            flex flex-col gap-5 p-5 overflow-y-auto">
            <FeatureToggles />
            <div className="border-t border-gray-100" />
            <ProcessingMode />
            <div className="border-t border-gray-100" />

            {features.bgRemoval && (
              <>
                <ColorPicker />
                <div className="border-t border-gray-100" />
              </>
            )}

            {!isDone && <ProcessButton />}

            {(isUploading || isProcessing || isDone) && <ProgressBar />}

            {isDone && (
              <>
                <div className="border-t border-gray-100" />
                <ResultPreview />
              </>
            )}
          </aside>

          {/* Right — video preview */}
          <main className="flex-1 flex flex-col items-center justify-center
                           bg-gray-50 p-8 overflow-hidden">
            {!isDone ? (
              <div className="w-full max-w-3xl flex flex-col gap-3">
                <p className="text-xs font-semibold text-gray-400
                              uppercase tracking-wider">
                  Original
                </p>
                <div className="rounded-2xl overflow-hidden border
                                border-gray-200 bg-black">
                  <video src={videoUrl} controls className="w-full" />
                </div>
                <p className="text-xs text-gray-400 text-center">
                  Configure options on the left, then press Process Video
                </p>
              </div>
            ) : (
              <div className="w-full max-w-3xl flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-400
                                uppercase tracking-wider">
                    Result
                  </p>
                  <p className="text-xs text-gray-300">
                    Use download button on the left to save
                  </p>
                </div>
                <div
                  className="rounded-2xl overflow-hidden border border-gray-200"
                  style={{
                    backgroundImage: `
                      linear-gradient(45deg, #ddd 25%, transparent 25%),
                      linear-gradient(-45deg, #ddd 25%, transparent 25%),
                      linear-gradient(45deg, transparent 75%, #ddd 75%),
                      linear-gradient(-45deg, transparent 75%, #ddd 75%)
                    `,
                    backgroundSize: '16px 16px',
                    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                  }}
                >
                  <video
                    src={useAppStore.getState().resultUrl}
                    controls
                    className="w-full"
                  />
                </div>
              </div>
            )}
          </main>

        </div>
      )}

    </div>
  )
}