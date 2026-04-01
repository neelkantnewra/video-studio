import useAppStore from '../store/useAppStore'

const LOCAL_BASE_URL = 'http://localhost:8000'
const CHUNK_SIZE = 1 * 1024 * 1024 // 1MB chunks — safely under ngrok limit

function getBaseUrl() {
  const { processingMode, remoteUrl } = useAppStore.getState()
  if (processingMode === 'remote' && remoteUrl) {
    return remoteUrl.replace(/\/$/, '')
  }
  return LOCAL_BASE_URL
}

function getHeaders() {
  const { processingMode } = useAppStore.getState()
  if (processingMode === 'remote') {
    return { 'ngrok-skip-browser-warning': 'true' }
  }
  return {}
}

// ── Chunked upload (used for remote mode) ────────────────────

async function uploadChunked(file, bgColor, onProgress) {
  const baseUrl  = getBaseUrl()
  const headers  = getHeaders()
  const uploadId = crypto.randomUUID()
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)

  console.log(`[client] Chunked upload: ${totalChunks} chunks, uploadId: ${uploadId}`)

  // Upload each chunk
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE
    const end   = Math.min(start + CHUNK_SIZE, file.size)
    const chunk = file.slice(start, end)

    const formData = new FormData()
    formData.append('file', new File([chunk], file.name))
    formData.append('upload_id', uploadId)
    formData.append('chunk_index', String(i))

    const res = await fetch(`${baseUrl}/api/v1/upload/chunk`, {
      method: 'POST',
      headers,
      body: formData,
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || `Chunk ${i} upload failed`)
    }

    // Report chunk progress to UI
    if (onProgress) {
      onProgress(i + 1, totalChunks)
    }

    console.log(`[client] Chunk ${i + 1}/${totalChunks} uploaded`)
  }

  // Assemble chunks and start job
  console.log(`[client] Assembling chunks...`)
  const assembleData = new FormData()
  assembleData.append('upload_id', uploadId)
  assembleData.append('filename', file.name)
  assembleData.append('total_chunks', String(totalChunks))
  assembleData.append('bg_color', bgColor)

  const res = await fetch(`${baseUrl}/api/v1/upload/assemble`, {
    method: 'POST',
    headers,
    body: assembleData,
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Assembly failed')
  }

  return res.json() // { job_id, status }
}

// ── Standard upload (used for local mode) ────────────────────

async function uploadDirect(file, bgColor) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('bg_color', bgColor)

  const res = await fetch(`${getBaseUrl()}/api/v1/bg-removal/process`, {
    method: 'POST',
    headers: getHeaders(),
    body: formData,
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Upload failed')
  }

  return res.json()
}

// ── Public API ────────────────────────────────────────────────

export async function uploadVideo(file, bgColor = '#FFFFFF', onChunkProgress) {
  const { processingMode } = useAppStore.getState()

  if (processingMode === 'remote') {
    return uploadChunked(file, bgColor, onChunkProgress)
  }
  return uploadDirect(file, bgColor)
}

export async function getJobStatus(jobId) {
  const res = await fetch(
    `${getBaseUrl()}/api/v1/bg-removal/status/${jobId}`,
    { headers: getHeaders() }
  )

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Status check failed')
  }

  return res.json()
}

export function getDownloadUrl(jobId) {
  return `${getBaseUrl()}/api/v1/bg-removal/download/${jobId}`
}