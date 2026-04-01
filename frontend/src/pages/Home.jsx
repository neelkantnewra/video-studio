import useAppStore from '../store/useAppStore'
import Header from '../components/Header.jsx'
import FeatureToggles from '../components/FeatureToggles.jsx'
import VideoUpload from '../components/VideoUpload.jsx'
import ColorPicker from '../components/ColorPicker.jsx'
import ProcessButton from '../components/ProcessButton.jsx'
import ProgressBar from '../components/ProgressBar.jsx'
import ResultPreview from '../components/ResultPreview.jsx'
import ProcessingMode from '../components/ProcessingMode.jsx'

export default function Home() {
  const videoUrl  = useAppStore((s) => s.videoUrl)
  const jobStatus = useAppStore((s) => s.jobStatus)
  const features  = useAppStore((s) => s.features)

  const hasVideo     = !!videoUrl
  const isProcessing = jobStatus === 'queued' || jobStatus === 'processing'
  const isDone       = jobStatus === 'done'

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <Header />

      {/* Body */}
      {!hasVideo ? (
        // ── Upload screen ────────────────────────────────────────
        <VideoUpload />
      ) : (
        // ── Editor layout ────────────────────────────────────────
        <div className="flex flex-1 overflow-hidden">

          {/* LEFT PANEL */}
          <aside className="w-72 shrink-0 bg-white border-r border-gray-200 flex flex-col gap-5 p-5 overflow-y-auto">

            {/* Feature toggles */}
            <FeatureToggles />

            <div className="border-t border-gray-100" />

            {/* Processing mode + remote URL */}
            <ProcessingMode />

            <div className="border-t border-gray-100" />

            {/* Color picker — only when bg removal is on */}
            {features.bgRemoval && (
              <>
                <ColorPicker />
                <div className="border-t border-gray-100" />
              </>
            )}

            {/* Process button */}
            {!isDone && <ProcessButton />}

            {/* Progress */}
            {(isProcessing || isDone) && <ProgressBar />}

            {/* Result actions */}
            {isDone && (
              <>
                <div className="border-t border-gray-100" />
                <ResultPreview />
              </>
            )}

          </aside>

          {/* RIGHT PANEL — video preview */}
          <main className="flex-1 flex flex-col items-center justify-center bg-gray-50 p-8 overflow-hidden">

            {!isDone ? (
              // Original video preview
              <div className="w-full max-w-3xl flex flex-col gap-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Original
                </p>
                <div className="rounded-2xl overflow-hidden border border-gray-200 bg-black">
                  <video
                    src={videoUrl}
                    controls
                    className="w-full"
                  />
                </div>
                <p className="text-xs text-gray-400 text-center">
                  Configure options on the left, then press Process Video
                </p>
              </div>
            ) : (
              // Result video — large, centre stage
              <div className="w-full max-w-3xl flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Result
                  </p>
                  {/* Side by side toggle hint */}
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