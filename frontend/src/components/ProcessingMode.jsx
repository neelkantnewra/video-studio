import { useRef } from 'react'
import useAppStore from '../store/useAppStore'

export default function ProcessingMode() {
  const processingMode  = useAppStore((s) => s.processingMode)
  const remoteUrl       = useAppStore((s) => s.remoteUrl)
  const remoteStatus    = useAppStore((s) => s.remoteStatus)
  const setProcessingMode = useAppStore((s) => s.setProcessingMode)
  const setRemoteUrl    = useAppStore((s) => s.setRemoteUrl)
  const checkRemoteUrl  = useAppStore((s) => s.checkRemoteUrl)
  const inputRef        = useRef(null)

  const statusConfig = {
    idle:        { dot: 'bg-gray-300',  text: 'Paste URL and verify'   },
    checking:    { dot: 'bg-yellow-400 animate-pulse', text: 'Checking…' },
    connected:   { dot: 'bg-green-500', text: 'Connected'              },
    unreachable: { dot: 'bg-red-500',   text: 'Unreachable'            },
  }

  const { dot, text } = statusConfig[remoteStatus] || statusConfig.idle

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Processing Mode
      </p>

      {/* Mode selector */}
      <div className="flex flex-col gap-1.5">

        {/* Local CPU option */}
        <button
          onClick={() => setProcessingMode('local')}
          className={`flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
            processingMode === 'local'
              ? 'bg-gray-900 border-gray-900'
              : 'bg-white border-gray-200 hover:border-gray-300'
          }`}
        >
          {/* Icon */}
          <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
            processingMode === 'local' ? 'bg-white/10' : 'bg-gray-100'
          }`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
              className={`w-4 h-4 ${processingMode === 'local' ? 'text-white' : 'text-gray-500'}`}>
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path strokeLinecap="round" d="M8 21h8M12 17v4" />
            </svg>
          </div>
          {/* Label */}
          <div>
            <p className={`text-sm font-medium ${
              processingMode === 'local' ? 'text-white' : 'text-gray-700'
            }`}>
              Local CPU
            </p>
            <p className={`text-xs ${
              processingMode === 'local' ? 'text-gray-300' : 'text-gray-400'
            }`}>
              This Mac — slower
            </p>
          </div>
          {/* Selected indicator */}
          {processingMode === 'local' && (
            <div className="ml-auto w-2 h-2 rounded-full bg-white" />
          )}
        </button>

        {/* Remote GPU option */}
        <button
          onClick={() => setProcessingMode('remote')}
          className={`flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
            processingMode === 'remote'
              ? 'bg-gray-900 border-gray-900'
              : 'bg-white border-gray-200 hover:border-gray-300'
          }`}
        >
          {/* Icon */}
          <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
            processingMode === 'remote' ? 'bg-white/10' : 'bg-gray-100'
          }`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
              className={`w-4 h-4 ${processingMode === 'remote' ? 'text-white' : 'text-gray-500'}`}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
            </svg>
          </div>
          {/* Label */}
          <div>
            <p className={`text-sm font-medium ${
              processingMode === 'remote' ? 'text-white' : 'text-gray-700'
            }`}>
              Remote GPU
            </p>
            <p className={`text-xs ${
              processingMode === 'remote' ? 'text-gray-300' : 'text-gray-400'
            }`}>
              Colab / Kaggle — faster
            </p>
          </div>
          {/* Selected indicator */}
          {processingMode === 'remote' && (
            <div className="ml-auto w-2 h-2 rounded-full bg-white" />
          )}
        </button>
      </div>

      {/* Remote URL input — only when remote is selected */}
      {processingMode === 'remote' && (
        <div className="flex flex-col gap-2">
          {/* URL field */}
          <div className="flex gap-1.5">
            <input
              ref={inputRef}
              type="text"
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              placeholder="https://abc123.ngrok.io"
              className="flex-1 px-3 py-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:border-gray-400 bg-white text-gray-700 placeholder-gray-300 font-mono"
            />
            {/* Verify button */}
            <button
              onClick={checkRemoteUrl}
              disabled={!remoteUrl || remoteStatus === 'checking'}
              className="px-3 py-2 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              {remoteStatus === 'checking' ? '…' : 'Verify'}
            </button>
          </div>

          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
            <p className="text-xs text-gray-400">{text}</p>
          </div>

          {/* Helper text */}
          {remoteStatus !== 'connected' && (
            <p className="text-xs text-gray-300 leading-relaxed">
              Run the notebook on Colab or Kaggle, copy the URL it prints, paste above.
            </p>
          )}
        </div>
      )}
    </div>
  )
}