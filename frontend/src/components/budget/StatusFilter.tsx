interface StatusFilterProps {
  statuses: string[];
  selectedStatus: string | null;
  onStatusSelect: (status: string | null) => void;
}

export default function StatusFilter({ statuses, selectedStatus, onStatusSelect }: StatusFilterProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "text-green-400 border-green-500/30";
      case "active": return "text-blue-400 border-blue-500/30";
      case "stalled": return "text-yellow-400 border-yellow-500/30";
      case "cancelled": return "text-red-400 border-red-500/30";
      default: return "text-slate-400 border-slate-500/30";
    }
  };
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return "✓";
      case "active": return "↻";
      case "stalled": return "⚠";
      case "cancelled": return "✗";
      default: return "○";
    }
  };
  
  const formatStatus = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };
  
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-2">
        <span className="flex items-center gap-2">
          <span className="text-slate-400">📊</span>
          Status
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onStatusSelect(null)}
          className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
            selectedStatus === null
              ? "bg-blue-600 text-white"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
          }`}
        >
          All Statuses
        </button>
        {statuses.map((status) => (
          <button
            key={status}
            onClick={() => onStatusSelect(status)}
            className={`rounded-full px-3 py-1.5 text-sm transition-colors border ${
              selectedStatus === status
                ? "bg-slate-700"
                : "bg-slate-800 hover:bg-slate-700"
            } ${getStatusColor(status)}`}
          >
            {getStatusIcon(status)} {formatStatus(status)}
          </button>
        ))}
      </div>
    </div>
  );
}