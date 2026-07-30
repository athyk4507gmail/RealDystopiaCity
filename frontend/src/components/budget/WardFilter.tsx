interface WardFilterProps {
  wards: number[];
  selectedWard: number | null;
  onWardSelect: (wardId: number | null) => void;
}

export default function WardFilter({ wards, selectedWard, onWardSelect }: WardFilterProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-2">
        <span className="flex items-center gap-2">
          <span className="text-slate-400">🏙️</span>
          Ward
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onWardSelect(null)}
          className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
            selectedWard === null
              ? "bg-blue-600 text-white"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
          }`}
        >
          All Wards
        </button>
        {wards.map((wardId) => (
          <button
            key={wardId}
            onClick={() => onWardSelect(wardId)}
            className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
              selectedWard === wardId
                ? "bg-blue-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Ward {wardId}
          </button>
        ))}
      </div>
    </div>
  );
}