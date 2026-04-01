import useAppStore from '../store/useAppStore'

export default function ProgressBar() {
  const jobStatus = useAppStore((s) => s.jobStatus)
  const progress  = useAppStore((s) => s.progress)
  const total     = useAppStore((s) => s.total)
  const error     = useAppStore((s) => s.error)

  // Nothing to show yet
  if (!jobStatus) return null

  const percent = total > 0 ? Math.round((progress / total) * 100) : 0

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Progress
      </p>

      {/* Error state */}
      {jobStatus === 'error' && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-100">
          <p className="text-xs font-medium text-red-600">
            ✕ Processing failed
          </p>
          {error && (
            <p className="text-xs text-red-400 mt-1">{error}</p>
          )}
        </div>
      )}

      {/* Active / done state */}
      {jobStatus !== 'error' && (
        <>
          {/* Bar */}
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                jobStatus === 'done' ? 'bg-green-500' : 'bg-gray-900'
              }`}
              style={{ width: `${jobStatus === 'done' ? 100 : percent}%` }}
            />
          </div>

          {/* Label */}
          <p className="text-xs text-gray-400">
            {jobStatus === 'queued' && 'Waiting to start…'}
            {jobStatus === 'processing' && total > 0 &&
              `Processing frame ${progress} of ${total} — ${percent}%`}
            {jobStatus === 'processing' && total === 0 &&
              'Starting…'}
            {jobStatus === 'done' && '✓ Complete'}
          </p>
        </>
      )}
    </div>
  )
}