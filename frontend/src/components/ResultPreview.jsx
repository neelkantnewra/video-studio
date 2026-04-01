import useAppStore from '../store/useAppStore'
import { getDownloadUrl } from '../api/client'

export default function ResultPreview() {
  const jobStatus = useAppStore((s) => s.jobStatus)
  const jobId     = useAppStore((s) => s.jobId)
  const resultUrl = useAppStore((s) => s.resultUrl)
  const reset     = useAppStore((s) => s.reset)

  if (jobStatus !== 'done' || !resultUrl) return null

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Result
      </p>

      {/* Video preview */}
      <div className="w-full rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
        <video
          src={resultUrl}
          controls
          className="w-full"
          style={{
            // Checkerboard pattern shows transparency
            backgroundImage: `
              linear-gradient(45deg, #ccc 25%, transparent 25%),
              linear-gradient(-45deg, #ccc 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #ccc 75%),
              linear-gradient(-45deg, transparent 75%, #ccc 75%)
            `,
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
          }}
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {/* Download */}
        <a
          href={getDownloadUrl(jobId)}
          download
          className="flex-1 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium text-center hover:bg-gray-700 transition-colors"
        >
          ↓ Download
        </a>

        {/* Start over */}
        <button
          onClick={reset}
          className="flex-1 py-2.5 rounded-lg bg-white border border-gray-200 text-gray-600 text-sm font-medium hover:border-gray-300 hover:bg-gray-50 transition-colors"
        >
          Start Over
        </button>
      </div>
    </div>
  )
}