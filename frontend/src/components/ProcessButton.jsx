import { useCallback } from 'react'
import useAppStore from '../store/useAppStore'
import { uploadVideo, getJobStatus, getDownloadUrl } from '../api/client'

const POLL_INTERVAL_MS = 1000

export default function ProcessButton() {
  const videoFile      = useAppStore((s) => s.videoFile)
  const jobStatus      = useAppStore((s) => s.jobStatus)
  const features       = useAppStore((s) => s.features)
  const bgColor        = useAppStore((s) => s.bgColor)
  const setJob         = useAppStore((s) => s.setJob)
  const updateProgress = useAppStore((s) => s.updateProgress)
  const setJobStatus   = useAppStore((s) => s.setJobStatus)
  const setResultUrl   = useAppStore((s) => s.setResultUrl)
  const setError       = useAppStore((s) => s.setError)

  const isProcessing = jobStatus === 'queued' || jobStatus === 'processing'
  const isDone       = jobStatus === 'done'
  const noFeature    = !features.bgRemoval && !features.eyeContact

  const handleProcess = useCallback(async () => {
    if (!videoFile || isProcessing) return

    setError(null)

    try {
      // 1. Upload & start job — pass bgColor
      const { job_id } = await uploadVideo(videoFile, bgColor)
      setJob(job_id)

      // 2. Poll until done or error
      const poll = setInterval(async () => {
        try {
          const data = await getJobStatus(job_id)
          updateProgress(data.progress, data.total)
          setJobStatus(data.status)

          if (data.status === 'done') {
            clearInterval(poll)
            setResultUrl(getDownloadUrl(job_id))
          }

          if (data.status === 'error') {
            clearInterval(poll)
            setError(data.error || 'Processing failed')
          }
        } catch (err) {
          clearInterval(poll)
          setError(err.message)
          setJobStatus('error')
        }
      }, POLL_INTERVAL_MS)

    } catch (err) {
      setError(err.message)
      setJobStatus('error')
    }
  }, [videoFile, isProcessing, bgColor, setJob, updateProgress, setJobStatus, setResultUrl, setError])

  if (!videoFile) return null

  if (noFeature) {
    return (
      <p className="text-xs text-gray-400 text-center">
        Enable at least one feature to process
      </p>
    )
  }

  return (
    <button
      onClick={handleProcess}
      disabled={isProcessing || isDone}
      className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
        isProcessing
          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
          : isDone
          ? 'bg-green-50 text-green-600 cursor-default'
          : 'bg-gray-900 text-white hover:bg-gray-700 active:bg-gray-800'
      }`}
    >
      {isProcessing
        ? 'Processing…'
        : isDone
        ? '✓ Done'
        : 'Process Video'}
    </button>
  )
}