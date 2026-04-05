import { useNavigate } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import Header from '../components/Header.jsx'
import FeatureToggles from '../components/FeatureToggles.jsx'
import VideoUpload from '../components/VideoUpload.jsx'
import ColorPicker from '../components/ColorPicker.jsx'
import ProcessButton from '../components/ProcessButton.jsx'
import ProgressBar from '../components/ProgressBar.jsx'
import ResultPreview from '../components/ResultPreview.jsx'
import ProcessingMode from '../components/ProcessingMode.jsx'
import SetupCard from '../features/eyeContact/SetupCard'

// ── Annotation entry card ─────────────────────────────────────────────────────
function AnnotationCard() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center px-6 py-5 gap-4">

      <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center
                      justify-center text-2xl select-none">
        🏷️
      </div>

      <div className="text-center">
        <p className="text-sm font-medium text-gray-700 mb-1">
          Annotation Studio
        </p>
        <p className="text-xs text-gray-400 leading-relaxed max-w-[200px]">
          Label your captured eye frames to build a precise training dataset.
        </p>
      </div>

      <button
        onClick={() => navigate('/annotate')}
        className="w-full max-w-[220px] border border-gray-200 text-gray-700
                   text-xs rounded-xl py-2.5 px-4 hover:bg-gray-50
                   hover:border-gray-300 transition-colors"
      >
        Open Annotation Studio →
      </button>

    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const videoUrl  = useAppStore((s) => s.videoUrl)
  const jobStatus = useAppStore((s) => s.jobStatus)
  const features  = useAppStore((s) => s.features)

  const hasVideo     = !!videoUrl
  const isProcessing = jobStatus === 'queued' || jobStatus === 'processing'
  const isDone       = jobStatus === 'done'
  const isUploading  = jobStatus === 'uploading'

  return (
    <div className="flex flex-col h-screen bg-gray-50">

      <Header />

      {!hasVideo ? (
        <div className="flex flex-1 overflow-hidden">

          {/* Left — drop zone */}
          <div className="flex-1 flex items-center justify-center p-8">
            <VideoUpload />
          </div>

          {/* Divider */}
          <div className="w-px bg-gray-200 self-stretch" />

          {/* Right — stacked cards */}
          <div className="w-80 shrink-0 flex flex-col overflow-y-auto">

            {/* Eye Contact section */}
            <div className="px-6 pt-6 pb-3 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400
                            uppercase tracking-wider">
                Eye Contact
              </p>
            </div>
            <SetupCard />

            {/* Dataset Tools section */}
            <div className="border-t border-gray-100">
              <div className="px-6 pt-5 pb-3">
                <p className="text-xs font-semibold text-gray-400
                              uppercase tracking-wider">
                  Dataset Tools
                </p>
              </div>
              <AnnotationCard />
            </div>

          </div>

        </div>

      ) : (
        <div className="flex flex-1 overflow-hidden">

          {/* Left panel */}
          <aside className="w-72 shrink-0 bg-white border-r border-gray-200
                            flex flex-col gap-5 p-5 overflow-y-auto">

            <FeatureToggles />
            <div className="border-t border-gray-100" />
            <ProcessingMode />
            <div className="border-t border-gray-100" />

            {features.bgRemoval && (
              <>
                <ColorPicker />
                <div className="border-t border-gray-100" />
              </>
            )}

            {!isDone && <ProcessButton />}

            {(isUploading || isProcessing || isDone) && <ProgressBar />}

            {isDone && (
              <>
                <div className="border-t border-gray-100" />
                <ResultPreview />
              </>
            )}

          </aside>

          {/* Right panel — video preview */}
          <main className="flex-1 flex flex-col items-center justify-center
                           bg-gray-50 p-8 overflow-hidden">

            {!isDone ? (
              <div className="w-full max-w-3xl flex flex-col gap-3">
                <p className="text-xs font-semibold text-gray-400
                              uppercase tracking-wider">
                  Original
                </p>
                <div className="rounded-2xl overflow-hidden border
                                border-gray-200 bg-black">
                  <video src={videoUrl} controls className="w-full" />
                </div>
                <p className="text-xs text-gray-400 text-center">
                  Configure options on the left, then press Process Video
                </p>
              </div>
            ) : (
              <div className="w-full max-w-3xl flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-400
                                uppercase tracking-wider">
                    Result
                  </p>
                  <p className="text-xs text-gray-300">
                    Use download button on the left to save
                  </p>
                </div>
                <div
                  className="rounded-2xl overflow-hidden border border-gray-200"
                  style={{
                    backgroundImage: `
                      linear-gradient(45deg, #ddd 25%, transparent 25%),
                      linear-gradient(-45deg, #ddd 25%, transparent 25%),
                      linear-gradient(45deg, transparent 75%, #ddd 75%),
                      linear-gradient(-45deg, transparent 75%, #ddd 75%)
                    `,
                    backgroundSize: '16px 16px',
                    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                  }}
                >
                  <video
                    src={useAppStore.getState().resultUrl}
                    controls
                    className="w-full"
                  />
                </div>
              </div>
            )}

          </main>
        </div>
      )}

    </div>
  )
}