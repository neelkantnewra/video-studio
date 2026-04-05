import { create } from 'zustand'
import { annotationApi } from '../api/annotationClient'

const useAnnotationStore = create((set, get) => ({

  // ── Sessions ──────────────────────────────────────────────────────────────
  sessions:       [],
  currentSession: null,

  // ── Frames ────────────────────────────────────────────────────────────────
  frames:            [],
  currentFrameIndex: 0,
  currentFrame:      null,

  // ── Annotation data ───────────────────────────────────────────────────────
  annotation:     null,
  autoDetected:   false,
  isDirty:        false,
  manuallyEdited: new Set(),

  // ── UI state ──────────────────────────────────────────────────────────────
  activeTool:    'select',
  activeEye:     'both',
  zoom:          1.0,
  showLandmarks: true,
  showIris:      true,
  showEyelids:   true,

  // ── Actions ───────────────────────────────────────────────────────────────

  fetchSessions: async () => {
    try {
      const sessions = await annotationApi.getSessions()
      set({ sessions })
    } catch (err) {
      console.error('[annotation] fetchSessions failed:', err)
    }
  },

  selectSession: async (sessionId) => {
    set({
      currentSession:    sessionId,
      frames:            [],
      currentFrame:      null,
      annotation:        null,
      currentFrameIndex: 0,
    })
    try {
      const frames = await annotationApi.getFrames(sessionId)
      set({ frames })
      if (frames.length > 0) {
        get().loadFrame(0)
      }
    } catch (err) {
      console.error('[annotation] selectSession failed:', err)
    }
  },

  loadFrame: async (index) => {
    const { frames, currentSession } = get()
    if (index < 0 || index >= frames.length) return

    const frame = frames[index]
    set({
      currentFrameIndex: index,
      currentFrame:      frame,
      annotation:        null,
      autoDetected:      false,
      isDirty:           false,
      manuallyEdited:    new Set(),
    })

    // ── Try loading existing saved annotation first ────────────────────────
    try {
      const existing = await annotationApi.getAnnotation(
        currentSession,
        frame.frame_id
      )
      set({ annotation: existing, autoDetected: false })
      return
    } catch {
      // No saved annotation yet — fall through to auto-detect
    }

    // ── Auto-detect with MediaPipe ─────────────────────────────────────────
    try {
      const auto = await annotationApi.autoDetect(
        currentSession,
        frame.frame_id
      )

      if (auto.auto_detected) {
        // Use suggested_gaze from manifest if available
        // so the user doesn't have to click the direction manually
        const suggested = auto.suggested_gaze || {}

        set({
          annotation: {
            frame_id:         frame.frame_id,
            image_path:       frame.image_url,
            image_dimensions: auto.image_dimensions,
            gaze: {
              direction:       suggested.direction       ?? frame.gaze_direction ?? 'unknown',
              is_target_frame: suggested.is_target_frame ?? frame.is_target_frame ?? false,
              target: {
                type:     'camera_center',
                screen_x: 0.5,
                screen_y: 0.5,
              },
            },
            left_eye:           auto.left_eye,
            right_eye:          auto.right_eye,
            head_pose:          auto.head_pose,
            manually_corrected: [],
          },
          autoDetected: true,
        })
      } else {
        // Face not detected — still create a skeleton so UI doesn't break
        set({
          annotation: {
            frame_id:         frame.frame_id,
            image_path:       frame.image_url,
            image_dimensions: auto.image_dimensions,
            gaze: {
              direction:       frame.gaze_direction ?? 'unknown',
              is_target_frame: frame.is_target_frame ?? false,
              target: {
                type:     'camera_center',
                screen_x: 0.5,
                screen_y: 0.5,
              },
            },
            left_eye:           null,
            right_eye:          null,
            head_pose:          null,
            manually_corrected: [],
          },
          autoDetected: false,
        })
      }
    } catch (err) {
      console.error('[annotation] autoDetect failed:', err)
    }
  },

  nextFrame: () => {
    const { currentFrameIndex, frames } = get()
    if (currentFrameIndex < frames.length - 1) {
      get().loadFrame(currentFrameIndex + 1)
    }
  },

  prevFrame: () => {
    const { currentFrameIndex } = get()
    if (currentFrameIndex > 0) {
      get().loadFrame(currentFrameIndex - 1)
    }
  },

  // ── Annotation mutations ──────────────────────────────────────────────────

  setGazeDirection: (direction) => {
    set((s) => ({
      annotation: {
        ...s.annotation,
        gaze: { ...s.annotation.gaze, direction },
      },
      isDirty: true,
    }))
  },

  setIsTargetFrame: (val) => {
    set((s) => ({
      annotation: {
        ...s.annotation,
        gaze: {
          ...s.annotation.gaze,
          is_target_frame: val,
          direction: val ? 'camera' : s.annotation.gaze.direction,
        },
      },
      isDirty: true,
    }))
  },

  updateIrisCenter: (eye, x, y) => {
    const field = `${eye}_eye`
    set((s) => ({
      annotation: {
        ...s.annotation,
        [field]: {
          ...s.annotation[field],
          iris_center:  { x, y },
          pupil_center: { x, y },
        },
      },
      manuallyEdited: new Set([
        ...s.manuallyEdited,
        `${field}.iris_center`,
      ]),
      isDirty: true,
    }))
  },

  updateEyelidPoint: (eye, lid, index, x, y) => {
    const field = `${eye}_eye`
    set((s) => {
      const eyeData        = { ...s.annotation[field] }
      const eyelids        = { ...eyeData.eyelids }
      const points         = [...eyelids[lid]]
      points[index]        = { x, y }
      eyelids[lid]         = points
      eyeData.eyelids      = eyelids
      return {
        annotation: { ...s.annotation, [field]: eyeData },
        manuallyEdited: new Set([
          ...s.manuallyEdited,
          `${field}.eyelids.${lid}`,
        ]),
        isDirty: true,
      }
    })
  },

  saveAnnotation: async () => {
    const { annotation, currentSession, manuallyEdited } = get()
    if (!annotation) return

    // Don't save if eyes weren't detected
    if (!annotation.left_eye || !annotation.right_eye) {
      console.warn('[annotation] Skipping save — no eye landmarks detected')
      return
    }

    try {
      const toSave = {
        ...annotation,
        manually_corrected: [...manuallyEdited],
      }
      await annotationApi.saveAnnotation(
        currentSession,
        annotation.frame_id,
        toSave
      )
      set({ isDirty: false })

      // Refresh frame list so green dot appears immediately
      const frames = await annotationApi.getFrames(currentSession)
      set({ frames })

      console.log('[annotation] Saved:', annotation.frame_id)
    } catch (err) {
      console.error('[annotation] saveAnnotation failed:', err)
    }
  },

  exportTraining: async () => {
    const { currentSession } = get()
    try {
      const result = await annotationApi.exportTraining(currentSession)
      return result
    } catch (err) {
      console.error('[annotation] exportTraining failed:', err)
    }
  },

  // ── UI setters ────────────────────────────────────────────────────────────

  setActiveTool:   (tool) => set({ activeTool: tool }),
  setActiveEye:    (eye)  => set({ activeEye: eye }),
  setZoom:         (z)    => set({ zoom: Math.max(0.5, Math.min(4, z)) }),
  toggleLandmarks: ()     => set((s) => ({ showLandmarks: !s.showLandmarks })),
  toggleIris:      ()     => set((s) => ({ showIris:      !s.showIris })),
  toggleEyelids:   ()     => set((s) => ({ showEyelids:   !s.showEyelids })),

}))

export default useAnnotationStore