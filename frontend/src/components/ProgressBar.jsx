import useAppStore from '../store/useAppStore'

export default function ProgressBar() {
  const jobStatus     = useAppStore((s) => s.jobStatus)
  const progress      = useAppStore((s) => s.progress)
  const total         = useAppStore((s) => s.total)
  const error         = useAppStore((s) => s.error)
  const processingMode = useAppStore((s) => s.processingMode)
  const uploadProgress = useAppStore((s) => s.uploadProgress)
  const uploadTotal    = useAppStore((s) => s.uploadTotal)

  if (!jobStatus) return null

  const isUploading  = jobStatus === 'uploading'
  const isQueued     = jobStatus === 'queued'
  const isProcessing = jobStatus === 'processing'
  const isDone       = jobStatus === 'done'
  const isError      = jobStatus === 'error'

  const uploadPercent  = uploadTotal > 0
    ? Math.round((uploadProgress / uploadTotal) * 100)
    : 0

  const processPercent = total > 0
    ? Math.round((progress / total) * 100)
    : 0

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Progress
      </p>

      {/* Error state */}
      {isError && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-100">
          <p className="text-xs font-medium text-red-600">✕ Processing failed</p>
          {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
        </div>
      )}

      {/* Upload progress — remote mode only */}
      {isUploading && processingMode === 'remote' && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 font-medium">Uploading</p>
            <p className="text-xs text-gray-400 font-mono">{uploadPercent}%</p>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-400 transition-all duration-300"
              style={{ width: `${uploadPercent}%` }}
            />
          </div>
          <p className="text-xs text-gray-400">
            Chunk {uploadProgress} of {uploadTotal} — sending to GPU
          </p>
        </>
      )}

      {/* Queued state */}
      {isQueued && (
        <>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full w-full rounded-full bg-gray-200 animate-pulse" />
          </div>
          <p className="text-xs text-gray-400">Waiting to start…</p>
        </>
      )}

      {/* Processing state */}
      {isProcessing && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 font-medium">Processing</p>
            <p className="text-xs text-gray-400 font-mono">{processPercent}%</p>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gray-900 transition-all duration-300"
              style={{ width: `${processPercent}%` }}
            />
          </div>
          <p className="text-xs text-gray-400">
            {total > 0
              ? `Frame ${progress} of ${total}`
              : 'Starting…'}
          </p>
        </>
      )}

      {/* Done state */}
      {isDone && (
        <>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full w-full rounded-full bg-green-500" />
          </div>
          <p className="text-xs text-gray-400">✓ Complete</p>
        </>
      )}
    </div>
  )
}