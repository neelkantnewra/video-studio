import { create } from 'zustand'

const useAppStore = create((set) => ({
  // --- Feature toggles ---
  features: {
    bgRemoval: true,
    eyeContact: false, // disabled until model is ready
  },
  toggleFeature: (key) =>
    set((state) => ({
      features: {
        ...state.features,
        [key]: !state.features[key],
      },
    })),

  // --- Upload state ---
  videoFile: null,       // raw File object
  videoUrl: null,        // local object URL for preview
  setVideo: (file) =>
    set({
      videoFile: file,
      videoUrl: URL.createObjectURL(file),
      // reset everything downstream when new video is uploaded
      jobId: null,
      jobStatus: null,
      progress: 0,
      total: 0,
      resultUrl: null,
      error: null,
    }),

  // --- Job state ---
  jobId: null,
  jobStatus: null,   // queued | processing | done | error
  progress: 0,
  total: 0,
  setJob: (jobId) => set({ jobId, jobStatus: 'queued', progress: 0, total: 0 }),
  updateProgress: (progress, total) => set({ progress, total }),
  setJobStatus: (status) => set({ jobStatus: status }),

  // --- Result ---
  resultUrl: null,
  setResultUrl: (url) => set({ resultUrl: url }),

  // --- Error ---
  error: null,
  setError: (error) => set({ error }),

  // --- Background color for removal ---
  bgColor: '#00FF00',  // default green, user can change
  setBgColor: (color) => set({ bgColor: color }),

  // --- Reset everything ---
  reset: () =>
    set({
      videoFile: null,
      videoUrl: null,
      jobId: null,
      jobStatus: null,
      progress: 0,
      total: 0,
      resultUrl: null,
      error: null,
    }),
}))

export default useAppStore