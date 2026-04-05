import { useEffect, useCallback, useState } from 'react'
import useAnnotationStore from '../../store/useAnnotationStore'
import AnnotationCanvas from './AnnotationCanvas'

const GAZE_DIRS = [
  { d: 'up-left',    label: '↖' },
  { d: 'up',         label: '↑' },
  { d: 'up-right',   label: '↗' },
  { d: 'left',       label: '←' },
  { d: 'camera',     label: '◎' },
  { d: 'right',      label: '→' },
  { d: 'down-left',  label: '↙' },
  { d: 'down',       label: '↓' },
  { d: 'down-right', label: '↘' },
]

const API = `http://${window.location.hostname}:8000/api/v1/annotation`

export default function AnnotationTab() {
  const {
    sessions, frames, currentSession,
    currentFrameIndex, annotation,
    isDirty, autoDetected,
    zoom, showLandmarks,
    activeEye, activeTool,
    fetchSessions, selectSession,
    loadFrame, nextFrame, prevFrame,
    setGazeDirection, setIsTargetFrame,
    saveAnnotation, exportTraining,
    setActiveTool, setActiveEye,
    setZoom, toggleLandmarks,
  } = useAnnotationStore()

  const [bulkStatus,   setBulkStatus]   = useState(null)
  const [bulkProgress, setBulkProgress] = useState(0)
  const [exportResult, setExportResult] = useState(null)
  const [activeTab,    setActiveTab]    = useState('frames') // 'frames' | 'stats'

  useEffect(() => { fetchSessions() }, [])

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  const onKey = useCallback((e) => {
    if (e.target.tagName === 'INPUT') return
    switch (e.key) {
      case 'ArrowRight': case 'd': nextFrame(); break
      case 'ArrowLeft':  case 'a': prevFrame(); break
      case 's': if (isDirty) saveAnnotation(); break
      case 't':
        if (annotation) setIsTargetFrame(!annotation.gaze.is_target_frame)
        break
      case '+': case '=': setZoom(zoom + 0.25); break
      case '-':            setZoom(zoom - 0.25); break
      default: break
    }
  }, [nextFrame, prevFrame, isDirty, saveAnnotation,
      annotation, setIsTargetFrame, setZoom, zoom])

  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKey])

  // ── Bulk auto-annotate all frames with MediaPipe ────────────────────────
  async function handleBulkAnnotate() {
    if (!currentSession || bulkStatus === 'running') return

    const unannotated = frames.filter(f => !f.annotated)
    if (unannotated.length === 0) {
      alert('All frames are already annotated!')
      return
    }

    setBulkStatus('running')
    setBulkProgress(0)

    let done = 0
    for (const frame of unannotated) {
      try {
        const auto = await fetch(
          `${API}/sessions/${currentSession}/autodetect/${frame.frame_id}`
        ).then(r => r.json())

        if (auto.auto_detected && auto.left_eye && auto.right_eye) {
          const suggested = auto.suggested_gaze || {}
          const payload = {
            frame_id:         frame.frame_id,
            image_path:       frame.image_url,
            image_dimensions: auto.image_dimensions,
            gaze: {
              direction:       suggested.direction       ?? frame.gaze_direction ?? 'unknown',
              is_target_frame: suggested.is_target_frame ?? false,
              target: { type: 'camera_center', screen_x: 0.5, screen_y: 0.5 },
            },
            left_eye:           auto.left_eye,
            right_eye:          auto.right_eye,
            head_pose:          auto.head_pose,
            manually_corrected: [],
          }
          await fetch(
            `${API}/sessions/${currentSession}/annotate/${frame.frame_id}`,
            {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify(payload),
            }
          )
        }
      } catch (err) {
        console.warn('[bulk] Failed on', frame.frame_id, err)
      }

      done++
      setBulkProgress(Math.round((done / unannotated.length) * 100))
    }

    setBulkStatus('done')
    await selectSession(currentSession)
    setTimeout(() => {
      setBulkStatus(null)
      setBulkProgress(0)
    }, 2000)
  }

  async function handleExport() {
    const result = await exportTraining()
    if (result) setExportResult(result)
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const annotatedCount = frames.filter(f => f.annotated).length
  const pendingCount   = frames.length - annotatedCount
  const progressPct    = frames.length
    ? Math.round((annotatedCount / frames.length) * 100)
    : 0

  // Group frames by label for organised display
  const framesByLabel = frames.reduce((acc, f, i) => {
    const label = f.label || 'unknown'
    if (!acc[label]) acc[label] = []
    acc[label].push({ ...f, index: i })
    return acc
  }, {})

  const labelColors = {
    at_camera:    'text-green-400',
    slightly_off: 'text-yellow-400',
    looking_away: 'text-red-400',
    unknown:      'text-neutral-400',
  }

  const labelNames = {
    at_camera:    '📷 At Camera',
    slightly_off: '👀 Slightly Off',
    looking_away: '↗ Looking Away',
    unknown:      '? Unknown',
  }

  return (
    <div className="flex h-full bg-neutral-950 text-white overflow-hidden">

      {/* ══════════════════════════════════════════════════════════════════
          LEFT PANEL — Sessions + Frames
          ══════════════════════════════════════════════════════════════════ */}
      <div className="w-56 flex flex-col flex-shrink-0
                      border-r border-neutral-800 bg-neutral-900">

        {/* Session selector */}
        <div className="p-3 border-b border-neutral-800">
          <p className="text-[10px] font-bold text-neutral-500
                        uppercase tracking-widest mb-2">
            Session
          </p>

          {sessions.length === 0 ? (
            <div className="text-xs text-neutral-600 py-3 text-center
                            leading-relaxed bg-neutral-800 rounded-lg p-3">
              <p className="text-lg mb-1">📭</p>
              <p>No sessions yet.</p>
              <p className="mt-1 text-neutral-700">
                Record eye samples first from the home screen.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {sessions.map(s => (
                <button
                  key={s.session_id}
                  onClick={() => selectSession(s.session_id)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg
                              text-xs transition-colors
                    ${currentSession === s.session_id
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-neutral-800 text-neutral-300'}`}
                >
                  <div className="font-medium text-[11px] truncate">
                    {s.session_id.replace('session_', '')}
                  </div>
                  <div className={`text-[10px] mt-0.5
                    ${currentSession === s.session_id
                      ? 'text-blue-200' : 'text-neutral-500'}`}>
                    {s.annotated_frames}/{s.total_frames} annotated
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Progress summary */}
        {frames.length > 0 && (
          <div className="px-3 py-2.5 border-b border-neutral-800">
            <div className="flex justify-between text-[10px] mb-1.5">
              <span className="text-neutral-500">Overall progress</span>
              <span className="text-white font-medium">{progressPct}%</span>
            </div>
            <div className="h-1.5 bg-neutral-700 rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              <div className="bg-neutral-800 rounded px-2 py-1 text-center">
                <p className="text-green-400 font-bold">{annotatedCount}</p>
                <p className="text-neutral-500">Done</p>
              </div>
              <div className="bg-neutral-800 rounded px-2 py-1 text-center">
                <p className="text-yellow-400 font-bold">{pendingCount}</p>
                <p className="text-neutral-500">Pending</p>
              </div>
            </div>
          </div>
        )}

        {/* Bulk annotate button */}
        {frames.length > 0 && pendingCount > 0 && (
          <div className="px-3 py-2 border-b border-neutral-800">
            {bulkStatus === 'running' ? (
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-blue-400 animate-pulse">
                    Auto-annotating...
                  </span>
                  <span className="text-white">{bulkProgress}%</span>
                </div>
                <div className="h-1.5 bg-neutral-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${bulkProgress}%` }}
                  />
                </div>
              </div>
            ) : bulkStatus === 'done' ? (
              <div className="text-xs text-green-400 text-center py-1">
                ✅ Auto-annotation complete!
              </div>
            ) : (
              <button
                onClick={handleBulkAnnotate}
                className="w-full py-2 rounded-lg text-xs font-semibold
                           bg-blue-700 hover:bg-blue-600 transition-colors
                           flex items-center justify-center gap-1.5"
              >
                ⚡ Auto-annotate all ({pendingCount})
              </button>
            )}
            <p className="text-[9px] text-neutral-600 text-center mt-1">
              MediaPipe fills landmarks automatically
            </p>
          </div>
        )}

        {/* Frame list — grouped by label */}
        <div className="flex-1 overflow-y-auto">
          {Object.entries(framesByLabel).map(([label, labelFrames]) => (
            <div key={label}>
              {/* Label group header */}
              <div className="px-3 py-1.5 bg-neutral-800/50 sticky top-0">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold
                    ${labelColors[label] || 'text-neutral-400'}`}>
                    {labelNames[label] || label}
                  </span>
                  <span className="text-[10px] text-neutral-500">
                    {labelFrames.filter(f => f.annotated).length}/
                    {labelFrames.length}
                  </span>
                </div>
              </div>

              {/* Frames in this group */}
              {labelFrames.map(f => (
                <button
                  key={f.frame_id}
                  onClick={() => loadFrame(f.index)}
                  className={`w-full text-left px-3 py-1.5 text-xs
                              flex items-center gap-2 transition-colors
                    ${f.index === currentFrameIndex
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-neutral-800 text-neutral-400'}`}
                >
                  {/* Status dot */}
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0
                    ${f.annotated ? 'bg-green-400' : 'bg-neutral-600'}`}
                  />
                  <span className="font-mono text-[10px] truncate">
                    {f.frame_id.split('_').pop()}
                  </span>
                  {f.annotated && (
                    <span className="ml-auto text-[9px] text-green-500">✓</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Export button */}
        {annotatedCount > 0 && (
          <div className="p-3 border-t border-neutral-800">
            <button
              onClick={handleExport}
              className="w-full py-2 rounded-lg text-xs font-semibold
                         bg-purple-700 hover:bg-purple-600 transition-colors"
            >
              📦 Export Training Data
            </button>
            {exportResult && (
              <div className="mt-2 text-[10px] text-center">
                <p className="text-green-400">
                  ✅ {exportResult.targets} targets,
                  {exportResult.inputs} inputs exported
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          CENTER — Toolbar + Canvas
          ══════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0
                        border-b border-neutral-800 bg-neutral-900">

          {/* Tool buttons with labels */}
          <div className="flex items-center gap-1 bg-neutral-800
                          rounded-lg p-1">
            {[
              { id: 'select',      icon: '↖', label: 'Select'    },
              { id: 'move_iris',   icon: '◎', label: 'Move Iris' },
              { id: 'edit_eyelid', icon: '〜', label: 'Eyelid'   },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTool(t.id)}
                title={t.label}
                className={`flex items-center gap-1 px-2 py-1 rounded-md
                            text-xs transition-colors
                  ${activeTool === t.id
                    ? 'bg-blue-600 text-white'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-700'}`}
              >
                <span>{t.icon}</span>
                <span className="text-[10px]">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-neutral-700" />

          {/* Eye selector with labels */}
          <div className="flex items-center gap-1 bg-neutral-800
                          rounded-lg p-1">
            <span className="text-[10px] text-neutral-500 px-1">Eye:</span>
            {['Both', 'Left', 'Right'].map(e => (
              <button
                key={e}
                onClick={() => setActiveEye(e.toLowerCase())}
                className={`px-2 py-1 rounded-md text-xs transition-colors
                  ${activeEye === e.toLowerCase()
                    ? 'bg-green-700 text-white'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-700'}`}
              >
                {e}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-neutral-700" />

          {/* Zoom with label */}
          <div className="flex items-center gap-1 text-xs text-neutral-400">
            <span className="text-[10px]">Zoom:</span>
            <button
              onClick={() => setZoom(zoom - 0.25)}
              className="w-6 h-6 rounded bg-neutral-700
                         hover:bg-neutral-600 text-sm font-bold"
            >
              −
            </button>
            <span className="w-10 text-center text-white text-[11px]">
              {zoom.toFixed(2)}×
            </span>
            <button
              onClick={() => setZoom(zoom + 0.25)}
              className="w-6 h-6 rounded bg-neutral-700
                         hover:bg-neutral-600 text-sm font-bold"
            >
              +
            </button>
          </div>

          <div className="w-px h-5 bg-neutral-700" />

          {/* Landmarks toggle */}
          <label className="flex items-center gap-1.5 text-xs
                            text-neutral-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showLandmarks}
              onChange={toggleLandmarks}
              className="accent-blue-500"
            />
            Show landmarks
          </label>

          {/* Nav — right aligned */}
          <div className="ml-auto flex items-center gap-2">
            {isDirty && (
              <span className="text-[10px] text-yellow-400 animate-pulse
                               bg-yellow-400/10 px-2 py-1 rounded">
                ● Unsaved changes
              </span>
            )}
            <button
              onClick={prevFrame}
              className="flex items-center gap-1 px-2 py-1 rounded
                         bg-neutral-700 hover:bg-neutral-600
                         text-xs transition-colors"
            >
              ← Prev <span className="text-neutral-500">(A)</span>
            </button>
            <span className="text-xs text-neutral-500 w-16 text-center">
              {frames.length
                ? `${currentFrameIndex + 1} / ${frames.length}`
                : '— / —'}
            </span>
            <button
              onClick={nextFrame}
              className="flex items-center gap-1 px-2 py-1 rounded
                         bg-neutral-700 hover:bg-neutral-600
                         text-xs transition-colors"
            >
              Next <span className="text-neutral-500">(D)</span> →
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 min-h-0 relative">
          <AnnotationCanvas />

          {/* Floating help overlay — shown when no frame loaded */}
          {!useAnnotationStore.getState().currentFrame && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-neutral-600 max-w-xs">
                <p className="text-5xl mb-4">👆</p>
                <p className="text-sm font-medium text-neutral-400 mb-2">
                  Select a session on the left
                </p>
                <p className="text-xs leading-relaxed">
                  Then click ⚡ Auto-annotate all to fill landmarks
                  automatically, or click any frame to annotate manually.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Bottom hint bar */}
        <div className="px-3 py-1.5 flex-shrink-0 border-t border-neutral-800
                        bg-neutral-900 flex items-center gap-4
                        text-[10px] text-neutral-600">
          <span>← / → &nbsp;Navigate frames</span>
          <span>S &nbsp;Save</span>
          <span>T &nbsp;Toggle target frame</span>
          <span>+/− &nbsp;Zoom</span>
          <span className="ml-auto text-neutral-700">
            Green = iris handle &nbsp;·&nbsp;
            Blue = eyelid points &nbsp;·&nbsp;
            Drag to adjust
          </span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          RIGHT PANEL — Frame info + Controls
          ══════════════════════════════════════════════════════════════════ */}
      <div className="w-64 flex flex-col flex-shrink-0 overflow-y-auto
                      border-l border-neutral-800 bg-neutral-900">

        {/* Frame status header */}
        <div className="p-3 border-b border-neutral-800">
          <p className="text-[10px] font-bold text-neutral-500
                        uppercase tracking-widest mb-2">
            Current Frame
          </p>

          {!annotation ? (
            <p className="text-xs text-neutral-600 text-center py-4">
              {currentSession
                ? 'Click a frame on the left to begin'
                : 'Select a session first'}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {/* Frame ID */}
              <div className="bg-neutral-800 rounded-lg px-3 py-2">
                <p className="text-[10px] text-neutral-500 mb-0.5">Frame ID</p>
                <p className="text-xs font-mono text-white truncate">
                  {annotation.frame_id}
                </p>
              </div>

              {/* Status badges */}
              <div className="flex flex-wrap gap-1">
                {annotation.gaze.is_target_frame && (
                  <span className="text-[10px] bg-green-500/20 text-green-400
                                   border border-green-500/30 px-2 py-0.5 rounded">
                    ✅ Target frame
                  </span>
                )}
                {autoDetected && (
                  <span className="text-[10px] bg-yellow-500/20 text-yellow-400
                                   border border-yellow-500/30 px-2 py-0.5 rounded">
                    ⚡ Auto-detected
                  </span>
                )}
                {!annotation.left_eye && (
                  <span className="text-[10px] bg-red-500/20 text-red-400
                                   border border-red-500/30 px-2 py-0.5 rounded">
                    ❌ No face detected
                  </span>
                )}
              </div>

              {/* Image size */}
              {annotation.image_dimensions && (
                <p className="text-[10px] text-neutral-600">
                  {annotation.image_dimensions.width} ×{' '}
                  {annotation.image_dimensions.height}px
                </p>
              )}
            </div>
          )}
        </div>

        {annotation && (
          <>
            {/* ── What to do ── */}
            <div className="p-3 border-b border-neutral-800">
              <p className="text-[10px] font-bold text-neutral-500
                            uppercase tracking-widest mb-2">
                Step 1 — Gaze Direction
              </p>

              <p className="text-[10px] text-neutral-500 mb-2 leading-relaxed">
                Is this frame a <strong className="text-white">target</strong> (looking at camera)
                or looking away?
              </p>

              {/* Target frame toggle */}
              <label className="flex items-start gap-2 mb-3 cursor-pointer
                                p-2.5 rounded-lg bg-neutral-800
                                hover:bg-neutral-750 border border-neutral-700
                                hover:border-neutral-600 transition-colors">
                <input
                  type="checkbox"
                  checked={annotation.gaze.is_target_frame}
                  onChange={e => setIsTargetFrame(e.target.checked)}
                  className="w-4 h-4 mt-0.5 accent-green-500 flex-shrink-0"
                />
                <div>
                  <p className="text-xs font-bold text-green-400">
                    Looking at camera
                  </p>
                  <p className="text-[10px] text-neutral-500 mt-0.5">
                    This is the TARGET we're training toward
                  </p>
                </div>
              </label>

              {/* Direction grid */}
              <p className="text-[10px] text-neutral-500 mb-1.5">
                Or select where eyes are looking:
              </p>
              <div className="grid grid-cols-3 gap-1">
                {GAZE_DIRS.map(({ d, label }) => (
                  <button
                    key={d}
                    onClick={() => setGazeDirection(d)}
                    title={d}
                    className={`py-2.5 rounded-lg text-base font-bold
                                transition-colors
                      ${annotation.gaze.direction === d
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-400'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-neutral-600 text-center mt-1.5">
                Selected:{' '}
                <span className="text-neutral-300 font-medium">
                  {annotation.gaze.direction}
                </span>
              </p>
            </div>

            {/* ── Eye landmark stats ── */}
            {(annotation.left_eye || annotation.right_eye) && (
              <div className="p-3 border-b border-neutral-800">
                <p className="text-[10px] font-bold text-neutral-500
                              uppercase tracking-widest mb-2">
                  Step 2 — Verify Landmarks
                </p>
                <p className="text-[10px] text-neutral-500 mb-2 leading-relaxed">
                  Drag the <span className="text-green-400 font-bold">green dot</span> to
                  center of iris if it's off. Drag{' '}
                  <span className="text-blue-400 font-bold">blue dots</span> to
                  adjust eyelids.
                </p>

                {['left', 'right'].map(side => {
                  const eye = annotation[`${side}_eye`]
                  if (!eye) return null
                  return (
                    <div key={side}
                      className="mb-2 bg-neutral-800 rounded-lg px-3 py-2">
                      <p className="text-[10px] font-semibold mb-1.5
                                    flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-green-400" />
                        {side === 'left' ? 'Left Eye' : 'Right Eye'}
                      </p>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1
                                      text-[10px]">
                        <span className="text-neutral-500">Iris center</span>
                        <span className="font-mono text-neutral-300">
                          {eye.iris_center?.x.toFixed(0)},
                          {eye.iris_center?.y.toFixed(0)}
                        </span>
                        <span className="text-neutral-500">Iris radius</span>
                        <span className="font-mono text-neutral-300">
                          {eye.iris_radius?.toFixed(1)}px
                        </span>
                        <span className="text-neutral-500">Openness</span>
                        <span className="font-mono text-neutral-300">
                          {((eye.openness || 0) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── Save ── */}
            <div className="p-3">
              <p className="text-[10px] font-bold text-neutral-500
                            uppercase tracking-widest mb-2">
                Step 3 — Save
              </p>

              <button
                onClick={saveAnnotation}
                disabled={!isDirty}
                className={`w-full py-3 rounded-xl font-bold text-sm
                            transition-all mb-2
                  ${isDirty
                    ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg'
                    : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'}`}
              >
                {isDirty ? '💾  Save Annotation  (S)' : '✅  Already Saved'}
              </button>

              <button
                onClick={() => nextFrame()}
                className="w-full py-2 rounded-xl text-xs font-medium
                           bg-neutral-800 hover:bg-neutral-700
                           text-neutral-400 transition-colors"
              >
                Skip to next frame →
              </button>

              {/* Quick legend */}
              <div className="mt-3 pt-3 border-t border-neutral-800
                              flex flex-col gap-1.5">
                <p className="text-[10px] font-bold text-neutral-600
                              uppercase tracking-widest">
                  Legend
                </p>
                {[
                  { color: 'bg-green-400', label: 'Iris center — drag to move' },
                  { color: 'bg-blue-400',  label: 'Eyelid points — drag to adjust' },
                  { color: 'bg-red-400',   label: 'Pupil center' },
                ].map(({ color, label }) => (
                  <div key={label}
                    className="flex items-center gap-2 text-[10px]
                               text-neutral-500">
                    <span className={`w-3 h-1 rounded-full flex-shrink-0
                                     ${color}`} />
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}