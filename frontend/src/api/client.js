const BASE_URL = 'http://localhost:8000'

export async function uploadVideo(file, bgColor = '#FFFFFF') {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('bg_color', bgColor)  // ← new

  const res = await fetch(`${BASE_URL}/api/v1/bg-removal/process`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Upload failed')
  }

  return res.json()
}

export async function getJobStatus(jobId) {
  const res = await fetch(`${BASE_URL}/api/v1/bg-removal/status/${jobId}`)

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Status check failed')
  }

  return res.json()
}

export function getDownloadUrl(jobId) {
  return `${BASE_URL}/api/v1/bg-removal/download/${jobId}`
}