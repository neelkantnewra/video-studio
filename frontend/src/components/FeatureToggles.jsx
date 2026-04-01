import useAppStore from '../store/useAppStore'

const FEATURES = [
  {
    key: 'bgRemoval',
    label: 'Remove Background',
    description: 'Strip background from every frame',
    available: true,
  },
  {
    key: 'eyeContact',
    label: 'Eye Contact',
    description: 'Coming soon',
    available: false,
  },
]

export default function FeatureToggles() {
  const features = useAppStore((s) => s.features)
  const toggleFeature = useAppStore((s) => s.toggleFeature)

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
        Features
      </p>

      {FEATURES.map(({ key, label, description, available }) => {
        const isOn = features[key]

        return (
          <div
            key={key}
            className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
              available
                ? isOn
                  ? 'bg-gray-900 border-gray-900'
                  : 'bg-white border-gray-200 hover:border-gray-300'
                : 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed'
            }`}
          >
            {/* Label + description */}
            <div className="flex flex-col gap-0.5">
              <span
                className={`text-sm font-medium ${
                  isOn && available ? 'text-white' : 'text-gray-700'
                }`}
              >
                {label}
              </span>
              <span
                className={`text-xs ${
                  isOn && available ? 'text-gray-300' : 'text-gray-400'
                }`}
              >
                {description}
              </span>
            </div>

            {/* Toggle switch */}
            <button
              disabled={!available}
              onClick={() => available && toggleFeature(key)}
              className={`relative w-10 h-6 rounded-full transition-colors focus:outline-none ${
                isOn && available ? 'bg-white' : 'bg-gray-200'
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
                  isOn && available
                    ? 'left-5 bg-gray-900'
                    : 'left-1 bg-white'
                }`}
              />
            </button>
          </div>
        )
      })}
    </div>
  )
}