import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'

// Gaze directions for the 3D face animation
const GAZE_STATES = {
  idle:         { x: 0,     y: 0    },
  at_camera:    { x: 0,     y: 0    },
  slightly_off: { x: 0.3,   y: 0.15 },
  looking_away: { x: -0.6,  y: 0.4  },
}

const API_BASE = `http://${window.location.hostname}:8000`

function FacePreview({ gazeState = 'idle' }) {
  const mountRef = useRef(null)
  const sceneRef = useRef({})

  useEffect(() => {
    const el = mountRef.current
    if (!el) return
    const W = el.clientWidth, H = el.clientHeight

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(window.devicePixelRatio)
    el.appendChild(renderer.domElement)

    // Scene + camera
    const scene  = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100)
    camera.position.set(0, 0, 5)

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dir = new THREE.DirectionalLight(0xffffff, 0.8)
    dir.position.set(2, 3, 4)
    scene.add(dir)

    // Head — flattened sphere
    const headGeo  = new THREE.SphereGeometry(1.2, 32, 32)
    headGeo.scale(1, 1.15, 0.88)
    const headMat  = new THREE.MeshStandardMaterial({ color: 0xd4956a, roughness: 0.8 })
    const head     = new THREE.Mesh(headGeo, headMat)
    scene.add(head)

    // Eye sockets (dark)
    function makeEye(x) {
      const g = new THREE.SphereGeometry(0.22, 16, 16)
      const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
      const mesh = new THREE.Mesh(g, m)
      mesh.position.set(x, 0.18, 1.0)
      return mesh
    }

    // Iris
    function makeIris(x) {
      const g = new THREE.SphereGeometry(0.11, 16, 16)
      const m = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.2 })
      const mesh = new THREE.Mesh(g, m)
      mesh.position.set(x, 0.18, 1.18)
      return mesh
    }

    const leftEye  = makeEye(-0.38)
    const rightEye = makeEye(0.38)
    const leftIris  = makeIris(-0.38)
    const rightIris = makeIris(0.38)

    scene.add(leftEye, rightEye, leftIris, rightIris)

    // Nose
    const noseGeo = new THREE.SphereGeometry(0.1, 12, 12)
    noseGeo.scale(1, 0.7, 1.2)
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xc4855a, roughness: 0.9 })
    const nose    = new THREE.Mesh(noseGeo, noseMat)
    nose.position.set(0, -0.2, 1.1)
    scene.add(nose)

    sceneRef.current = { renderer, scene, camera, leftIris, rightIris, head }

    // Animate
    let animId
    const animate = () => {
      animId = requestAnimationFrame(animate)
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(animId)
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [])

  // Animate iris to gaze target
  useEffect(() => {
    const { leftIris, rightIris, head } = sceneRef.current
    if (!leftIris) return

    const target = GAZE_STATES[gazeState] || GAZE_STATES.idle
    const baseL  = { x: -0.38, y: 0.18, z: 1.18 }
    const baseR  = { x:  0.38, y: 0.18, z: 1.18 }

    // Smoothly interpolate iris position
    let progress = 0
    const startL = { x: leftIris.position.x,  y: leftIris.position.y  }
    const startR = { x: rightIris.position.x, y: rightIris.position.y }
    const targetL = { x: baseL.x + target.y * 0.15, y: baseL.y - target.x * 0.08 }
    const targetR = { x: baseR.x + target.y * 0.15, y: baseR.y - target.x * 0.08 }

    const interval = setInterval(() => {
      progress = Math.min(progress + 0.06, 1)
      const t  = 1 - Math.pow(1 - progress, 3) // ease out cubic

      leftIris.position.x  = startL.x + (targetL.x - startL.x) * t
      leftIris.position.y  = startL.y + (targetL.y - startL.y) * t
      rightIris.position.x = startR.x + (targetR.x - startR.x) * t
      rightIris.position.y = startR.y + (targetR.y - startR.y) * t

      // Also tilt head slightly
      head.rotation.y = -target.y * 0.3
      head.rotation.x =  target.x * 0.2

      if (progress >= 1) clearInterval(interval)
    }, 16)

    return () => clearInterval(interval)
  }, [gazeState])

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
}

// ── Main setup card ───────────────────────────────────────────

const STATUS_GAZE = ['at_camera', 'slightly_off', 'looking_away', 'idle']

export default function SetupCard() {
  const navigate    = useNavigate()
  const [gazeIdx, setGazeIdx] = useState(0)
  const [isTrained, setIsTrained] = useState(false)

  // Check if model already trained
  useEffect(() => {
    fetch(`${API_BASE}/api/v1/eye-contact/status`)
      .then(r => r.json())
      .then(d => setIsTrained(d.trained))
      .catch(() => {})
  }, [])

  // Cycle through gaze directions for demo
  useEffect(() => {
    if (isTrained) return
    const id = setInterval(() => {
      setGazeIdx(i => (i + 1) % STATUS_GAZE.length)
    }, 1800)
    return () => clearInterval(id)
  }, [isTrained])

  const gazeState = STATUS_GAZE[gazeIdx]

  return (
    <div className="h-full flex flex-col items-center justify-center p-8 gap-6">

      {/* 3D face preview */}
      <div className="w-48 h-48 rounded-full overflow-hidden bg-gray-100 border border-gray-200">
        <FacePreview gazeState={isTrained ? 'at_camera' : gazeState} />
      </div>

      {/* Status + CTA */}
      {isTrained ? (
        <>
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
              <p className="text-sm font-medium text-gray-700">Eye contact model ready</p>
            </div>
            <p className="text-xs text-gray-400">Personalized to your face</p>
          </div>
          <button
            onClick={() => navigate('/setup/eye-contact')}
            className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
          >
            Recalibrate
          </button>
        </>
      ) : (
        <>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700 mb-1">Eye Contact Correction</p>
            <p className="text-xs text-gray-400 leading-relaxed max-w-[200px]">
              Takes 2 minutes. We capture your gaze in three directions to train a model personalized to your face.
            </p>
          </div>
          <button
            onClick={() => navigate('/setup/eye-contact')}
            className="w-full max-w-[220px] bg-gray-900 text-white text-sm rounded-xl py-2.5 px-4 hover:bg-gray-700 transition-colors"
          >
            Set up eye contact →
          </button>
        </>
      )}

    </div>
  )
}