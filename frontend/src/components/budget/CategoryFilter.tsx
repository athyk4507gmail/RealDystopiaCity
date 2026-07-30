interface CategoryFilterProps {
  categories: string[];
  selectedCategory: string | null;
  onCategorySelect: (category: string | null) => void;
  formatCategory: (category: string) => string;
}

export default function CategoryFilter({ 
  categories, 
  selectedCategory, 
  onCategorySelect, 
  formatCategory 
}: CategoryFilterProps) {
  const getCategoryIcon = (category: string) => {
    if (category.includes('water')) return "💧";
    if (category.includes('road')) return "🛣️";
    if (category.includes('drainage')) return "🌊";
    if (category.includes('building')) return "🏢";
    if (category.includes('park')) return "🌳";
    if (category.includes('electricity')) return "⚡";
    if (category.includes('health')) return "🏥";
    if (category.includes('education')) return "📚";
    if (category.includes('transport')) return "🚌";
    return "🏛️";
  };
  
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-2">
        <span className="flex items-center gap-2">
          <span className="text-slate-400">🏷️</span>
          Category
        </span>
      </label>
      <select
        value={selectedCategory || ""}
        onChange={(e) => onCategorySelect(e.target.value || null)}
        className="w-full rounded-lg border border-border bg-slate-800 px-3 py-2 text-sm text-slate-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">All Categories</option>
        {categories.map((category) => (
          <option key={category} value={category}>
            {getCategoryIcon(category)} {formatCategory(category)}
          </option>
        ))}
      </select>
      {selectedCategory && (
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Selected: {formatCategory(selectedCategory)}
          </span>
          <button
            onClick={() => onCategorySelect(null)}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}