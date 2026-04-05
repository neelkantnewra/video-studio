import { useRef, useEffect, useState, useCallback } from 'react'
import useAnnotationStore from '../../store/useAnnotationStore'

// ── Draw colors ───────────────────────────────────────────────────────────
const COLOR_IRIS    = '#00ff88'
const COLOR_PUPIL   = '#ff4444'
const COLOR_EYELID  = '#4488ff'
const COLOR_LABEL   = '#ffffff'
const HANDLE_RADIUS = 6

export default function AnnotationCanvas() {
  const canvasRef  = useRef(null)
  const imgRef     = useRef(null)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [dragging,  setDragging]  = useState(null)

  const {
    currentFrame,
    annotation,
    zoom,
    showLandmarks,
    activeTool,
    activeEye,
    updateIrisCenter,
    updateEyelidPoint,
  } = useAnnotationStore()

  // ── Load image whenever frame changes ─────────────────────────────────
  useEffect(() => {
    if (!currentFrame) return
    setImgLoaded(false)

    const img  = new Image()
    img.onload = () => {
      imgRef.current = img
      setImgLoaded(true)
    }
    img.onerror = () => console.error('[canvas] Failed to load image')
    img.src     = currentFrame.image_url
  }, [currentFrame])

  // ── Redraw whenever anything relevant changes ──────────────────────────
  useEffect(() => {
    draw()
  }, [annotation, zoom, showLandmarks, imgLoaded])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const img    = imgRef.current
    if (!canvas || !img || !imgLoaded) return

    const ctx = canvas.getContext('2d')

    // Resize canvas to match zoomed image
    canvas.width  = img.naturalWidth  * zoom
    canvas.height = img.naturalHeight * zoom

    ctx.save()
    ctx.scale(zoom, zoom)

    // Draw the image
    ctx.drawImage(img, 0, 0)

    // Draw landmarks on top
    if (showLandmarks && annotation) {
      drawEye(ctx, annotation.left_eye,  'L')
      drawEye(ctx, annotation.right_eye, 'R')
    }

    ctx.restore()
  }, [annotation, zoom, showLandmarks, imgLoaded])

  function drawEye(ctx, eye, label) {
    if (!eye) return

    // ── Eyelids ──────────────────────────────────────────────────────────
    for (const lid of ['upper', 'lower']) {
      const pts = eye.eyelids?.[lid]
      if (!pts || pts.length === 0) continue

      // Draw the line
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (const p of pts) ctx.lineTo(p.x, p.y)
      ctx.strokeStyle = COLOR_EYELID
      ctx.lineWidth   = 1.5 / zoom
      ctx.stroke()

      // Draw each handle
      for (const p of pts) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, HANDLE_RADIUS / zoom, 0, Math.PI * 2)
        ctx.fillStyle = COLOR_EYELID
        ctx.fill()
      }
    }

    // ── Iris circle ───────────────────────────────────────────────────────
    if (eye.iris_center && eye.iris_radius) {
      ctx.beginPath()
      ctx.arc(
        eye.iris_center.x,
        eye.iris_center.y,
        eye.iris_radius,
        0, Math.PI * 2
      )
      ctx.strokeStyle = COLOR_IRIS
      ctx.lineWidth   = 1.5 / zoom
      ctx.stroke()

      // Iris center handle
      ctx.beginPath()
      ctx.arc(
        eye.iris_center.x,
        eye.iris_center.y,
        HANDLE_RADIUS / zoom,
        0, Math.PI * 2
      )
      ctx.fillStyle = COLOR_IRIS
      ctx.fill()
    }

    // ── Pupil circle ──────────────────────────────────────────────────────
    if (eye.pupil_center && eye.pupil_radius) {
      ctx.beginPath()
      ctx.arc(
        eye.pupil_center.x,
        eye.pupil_center.y,
        eye.pupil_radius,
        0, Math.PI * 2
      )
      ctx.strokeStyle = COLOR_PUPIL
      ctx.lineWidth   = 1 / zoom
      ctx.stroke()
    }

    // ── Label ─────────────────────────────────────────────────────────────
    if (eye.iris_center) {
      ctx.fillStyle = COLOR_LABEL
      ctx.font      = `bold ${11 / zoom}px monospace`
      ctx.fillText(
        label,
        eye.iris_center.x - 3 / zoom,
        eye.iris_center.y - eye.iris_radius - 5 / zoom
      )
    }
  }

  // ── Convert canvas mouse position → image coordinates ─────────────────
  function toImgCoords(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left)  / zoom,
      y: (e.clientY - rect.top)   / zoom,
    }
  }

  // ── Hit test — what did the user click? ───────────────────────────────
  function hitTest(imgX, imgY) {
    if (!annotation) return null

    for (const side of ['left', 'right']) {
      // Skip if we're only editing one eye
      if (activeEye !== 'both' && activeEye !== side) continue

      const eye = annotation[`${side}_eye`]
      if (!eye) continue

      // Check iris center handle
      const ic = eye.iris_center
      if (ic && Math.hypot(imgX - ic.x, imgY - ic.y) < HANDLE_RADIUS * 1.5 / zoom) {
        return { type: 'iris', side }
      }

      // Check eyelid point handles
      for (const lid of ['upper', 'lower']) {
        const pts = eye.eyelids?.[lid] || []
        for (let i = 0; i < pts.length; i++) {
          if (Math.hypot(imgX - pts[i].x, imgY - pts[i].y) < HANDLE_RADIUS * 1.5 / zoom) {
            return { type: 'eyelid', side, lid, index: i }
          }
        }
      }
    }
    return null
  }

  // ── Mouse handlers ────────────────────────────────────────────────────
  const onMouseDown = (e) => {
    const { x, y } = toImgCoords(e)
    const hit = hitTest(x, y)
    if (hit) {
      e.preventDefault()
      setDragging(hit)
    }
  }

  const onMouseMove = (e) => {
    if (!dragging) return
    const { x, y } = toImgCoords(e)

    if (dragging.type === 'iris') {
      updateIrisCenter(dragging.side, x, y)
    } else if (dragging.type === 'eyelid') {
      updateEyelidPoint(dragging.side, dragging.lid, dragging.index, x, y)
    }
  }

  const onMouseUp = () => setDragging(null)

  // ── Cursor style based on what's under mouse ──────────────────────────
  const getCursor = () => {
    if (dragging)         return 'grabbing'
    if (activeTool === 'move_iris')   return 'crosshair'
    if (activeTool === 'edit_eyelid') return 'crosshair'
    return 'default'
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full overflow-auto bg-neutral-900
                    flex items-start justify-start">
      {!currentFrame ? (
        // Empty state
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-center text-neutral-600">
            <p className="text-4xl mb-3">🖼️</p>
            <p className="text-sm">Select a session and frame to begin</p>
          </div>
        </div>
      ) : !imgLoaded ? (
        // Loading state
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-center text-neutral-600">
            <p className="text-sm">Loading frame...</p>
          </div>
        </div>
      ) : (
        // Canvas
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          style={{ cursor: getCursor(), display: 'block' }}
        />
      )}
    </div>
  )
}