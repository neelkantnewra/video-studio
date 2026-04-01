import useAppStore from '../store/useAppStore'

const PRESETS = [
  { label: 'Green',  value: '#00FF00' },
  { label: 'Black',  value: '#000000' },
  { label: 'White',  value: '#FFFFFF' },
  { label: 'Blue',   value: '#0000FF' },
  { label: 'Red',    value: '#FF0000' },
]

export default function ColorPicker() {
  const bgColor = useAppStore((s) => s.bgColor)
  const setBgColor = useAppStore((s) => s.setBgColor)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Background Color
      </p>

      {/* Preset swatches */}
      <div className="flex items-center gap-2 flex-wrap">
        {PRESETS.map(({ label, value }) => (
          <button
            key={value}
            title={label}
            onClick={() => setBgColor(value)}
            className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${
              bgColor === value
                ? 'border-gray-900 scale-110'
                : 'border-gray-200'
            }`}
            style={{ backgroundColor: value }}
          />
        ))}
      </div>

      {/* Custom color input */}
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-full border border-gray-200 shrink-0"
          style={{ backgroundColor: bgColor }}
        />
        <input
          type="color"
          value={bgColor}
          onChange={(e) => setBgColor(e.target.value)}
          className="w-full h-8 rounded cursor-pointer border border-gray-200"
          title="Custom color"
        />
      </div>

      {/* Current hex value */}
      <p className="text-xs text-gray-400 font-mono">
        {bgColor.toUpperCase()}
      </p>
    </div>
  )
}