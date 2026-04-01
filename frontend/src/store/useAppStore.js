import { create } from 'zustand'

const useAppStore = create((set, get) => ({
  // --- Feature toggles ---
  features: {
    bgRemoval: true,
    eyeContact: false,
  },
  toggleFeature: (key) =>
    set((state) => ({
      features: {
        ...state.features,
        [key]: !state.features[key],
      },
    })),

  // --- Processing mode ---
  processingMode: 'local',        // 'local' | 'remote'
  remoteUrl: '',                  // ngrok URL pasted by user
  remoteStatus: 'idle',           // 'idle' | 'checking' | 'connected' | 'unreachable'
  setProcessingMode: (mode) => set({ processingMode: mode }),
  setRemoteUrl: (url) => set({ remoteUrl: url, remoteStatus: 'idle' }),
  setRemoteStatus: (status) => set({ remoteStatus: status }),

  // Check if remote URL is reachable
 checkRemoteUrl: async () => {
  const { remoteUrl } = get()
  if (!remoteUrl) return

  set({ remoteStatus: 'checking' })
  try {
    const res = await fetch(`${remoteUrl.replace(/\/$/, '')}/health`, {
      signal: AbortSignal.timeout(5000),
      headers: {
        'ngrok-skip-browser-warning': 'true',  // ← skips ngrok warning page
      },
    })
    const data = await res.json()
    if (res.ok && data.status === 'ok') {
      set({ remoteStatus: 'connected' })
    } else {
      set({ remoteStatus: 'unreachable' })
    }
  } catch {
    set({ remoteStatus: 'unreachable' })
  }
},

  

  // --- Upload state ---
  videoFile: null,
  videoUrl: null,
  setVideo: (file) =>
    set({
      videoFile: file,
      videoUrl: URL.createObjectURL(file),
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

  // --- Background color ---
  bgColor: '#00FF00',
  setBgColor: (color) => set({ bgColor: color }),

  // --- Reset ---
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