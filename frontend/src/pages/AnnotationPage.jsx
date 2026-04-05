import { useNavigate } from 'react-router-dom'
import AnnotationTab from '../features/annotation/AnnotationTab'

export default function AnnotationPage() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-white">

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5
                      border-b border-neutral-800 bg-neutral-900 flex-shrink-0">

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-xs text-neutral-400
                       hover:text-white transition px-2 py-1 rounded
                       hover:bg-neutral-800"
          >
            ← Back
          </button>

          <div className="w-px h-4 bg-neutral-700" />

          <span className="text-sm font-semibold text-white">
            Annotation Studio
          </span>

          <span className="text-xs text-neutral-500">
            Eye Gaze Dataset Builder
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span>Ready</span>
        </div>

      </div>

      {/* Main content */}
      <div className="flex-1 min-h-0">
        <AnnotationTab />
      </div>

    </div>
  )
}