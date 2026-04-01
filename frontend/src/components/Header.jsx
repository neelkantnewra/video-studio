export default function Header() {
  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center px-6 shrink-0">
      <div className="flex items-center gap-2">
        {/* Logo mark */}
        <div className="w-7 h-7 bg-gray-900 rounded-md flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="w-4 h-4 text-white"
            stroke="currentColor"
            strokeWidth={2}
          >
            <polygon points="5,3 19,12 5,21" fill="white" />
          </svg>
        </div>
        {/* Title */}
        <span className="text-base font-semibold tracking-tight text-gray-900">
          Video Studio
        </span>
      </div>
    </header>
  )
}