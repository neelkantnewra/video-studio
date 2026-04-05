const BASE = `http://${window.location.hostname}:8000/api/v1/annotation`

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json()
}

export const annotationApi = {

  // Sessions
  getSessions: () =>
    req('/sessions'),

  // Frames
  getFrames: (sessionId) =>
    req(`/sessions/${sessionId}/frames`),

  // Auto MediaPipe detection
  autoDetect: (sessionId, frameId) =>
    req(`/sessions/${sessionId}/autodetect/${frameId}`),

  // Annotation CRUD
  getAnnotation: (sessionId, frameId) =>
    req(`/sessions/${sessionId}/annotation/${frameId}`),

  saveAnnotation: (sessionId, frameId, data) =>
    req(`/sessions/${sessionId}/annotate/${frameId}`, {
      method: 'POST',
      body:   JSON.stringify(data),
    }),

  // Export
  exportTraining: (sessionId) =>
    req(`/sessions/${sessionId}/export-training`, { method: 'POST' }),

  // Stats
  getStats: () =>
    req('/stats'),

}