# Global Text Visibility System

## Overview
CSS-only contrast refinement pass to ensure ALL text across the entire app is clearly, comfortably visible and readable on every page and component.

## Text Color System

### CSS Variables (Source of Truth)
```css
:root {
  --text-primary: #f8fafc;     /* headings, key values/numbers */
  --text-secondary: #e2e8f0;   /* body text, descriptions, card labels */
  --text-muted: #a8b3c1;       /* timestamps, helper text, captions */
  --text-link: #7dd3fc;        /* interactive/clickable text */
}
```

### Rationale for --text-muted (#a8b3c1)
- Raised from standard `#94a3b8` to `#a8b3c1`
- Slightly brighter than typical "muted grey"
- Necessary because app has overlapping dark/glass surfaces
- Standard muted grey disappears against glassmorphism panels
- Errs toward more visible

## Global Overrides Applied

### 1. Tailwind Class Remapping
All existing Tailwind text classes now use our system:

```css
.text-slate-300 → var(--text-secondary)
.text-slate-400 → var(--text-muted)
.text-slate-500 → var(--text-muted)
```

### 2. Semantic HTML Elements
```css
h1, h2, h3, h4, h5, h6 → var(--text-primary)
p → var(--text-secondary)
label → var(--text-secondary)
```

### 3. Stat Card Labels
```css
/* Labels are important UI elements, not footnotes */
.stat-card-glass .uppercase → var(--text-secondary)
```

### 4. Glass Panel Content
```css
.glass-panel h3, h4 → var(--text-primary) !important
.glass-panel p → var(--text-secondary)
.glass-panel li → var(--text-secondary)
```

### 5. Data Visualization
```css
/* Chart text must be readable */
.recharts-text,
.recharts-label,
.recharts-cartesian-axis-tick-value → var(--text-secondary)
```

### 6. Size-Based Hierarchy
```css
/* Large text = important = primary color */
.text-xl, .text-2xl, .text-3xl, etc. → var(--text-primary)

/* Small text = still visible */
.text-xs → var(--text-secondary)

/* Timestamps/metadata can be more subdued */
.text-xs.text-slate-400 → var(--text-muted)
```

### 7. Interactive Elements
```css
button, button span → var(--text-secondary)
button:hover → var(--text-primary)
a → var(--text-link)
a:hover → var(--text-primary)
```

### 8. Table Content
```css
table → var(--text-secondary)
th → var(--text-primary)
td → var(--text-secondary)
```

### 9. Form Elements
```css
input, select, textarea → var(--text-primary)
placeholder text → var(--text-muted)
```

### 10. Status Colors (Enhanced Brightness)
```css
.text-emerald-400 → #6ee7b7 (brighter green)
.text-yellow-400 → #fbbf24 (brighter yellow)
.text-red-400 → #f87171 (brighter red)
.text-cyan-400 → #67e8f9 (brighter cyan)
```

## Components Affected

### All Pages
- ✅ Water Distribution
- ✅ Complaints
- ✅ Trust Score
- ✅ Risk Zones
- ✅ Traffic Mood
- ✅ Traffic Management
- ✅ City Metabolism

### Specific Elements Updated

**Water Distribution:**
- Page description
- Stat card labels (WARDS, SUPPLY TODAY, etc.)
- Weather/reservoir labels
- Ward schedule details
- Supply times
- Ward selection label
- Conservation tips list
- Map legend text
- Chart axis labels

**Complaints:**
- Filter labels (Ward, Status)
- Table headers
- Table cell content
- Timestamps
- Empty state message

**Trust Score:**
- Time slot/From/To labels
- Route recommendations
- Alternative route text
- Leaderboard table
- Chart labels

**Risk Zones:**
- Segment list items
- Risk analysis text
- Legend markers

**Traffic Mood:**
- Event titles
- Event locations/types
- Severity indicators
- Crowd sizes
- Reasoning boxes

**Traffic Management:**
- Signal recommendations
- Timing adjustments
- Alternative routes

**City Metabolism:**
- Vital gauge labels
- Stress test buttons
- Cascade steps
- Resilience index

**Shared Components:**
- StatCard labels
- ReasoningBox text
- DataSourceBadge text
- ChatPanel messages
- LoadingSkeleton (inherits from parents)

## Text Hierarchy Implementation

### Primary Text (#f8fafc - Brightest)
**Usage:** Maximum visibility
- Page titles
- Section headings
- Stat numbers
- Key values
- Data point labels
- Table headers
- Important call-to-action text

### Secondary Text (#e2e8f0 - Clear)
**Usage:** Standard readability
- Body paragraphs
- Card descriptions
- List items
- Button labels
- Form labels
- Table cell content
- Stat card labels (uppercase)
- Chart axis labels
- Legend text

### Muted Text (#a8b3c1 - Subdued but Visible)
**Usage:** Supporting information
- Timestamps ("Updated Xs ago")
- Helper text
- Captions
- Metadata (IDs, codes)
- Secondary measurements
- Fine print

### Link Text (#7dd3fc - Interactive)
**Usage:** Clickable elements
- Hyperlinks
- Interactive text
- Accent-colored labels
- Focus indicators

## Special Cases

### Glass Panel Transparency Issue
Since glass panels are semi-transparent (rgba 0.025), text must have adequate contrast against:
1. The panel's own fill color
2. Whatever shows through behind it (background patterns)

**Solution:** Increased base text brightness across the board, especially for --text-muted

### Chart Text Visibility
Chart libraries often default to dim colors.

**Override Applied:**
```css
.recharts-text { fill: var(--text-secondary) !important; }
```

### Badge Text Contrast
Badges have colored backgrounds (emerald, yellow, slate).

**Solution:** Brightened status color values to ensure text remains visible against badge backgrounds

### Empty States
"No data" messages should be noticeable, not invisible.

**Override:**
```css
.text-center.text-slate-400 { color: var(--text-secondary) !important; }
```

## Verification Checklist

For each page, verify these elements are clearly readable:

- [ ] Page title and description
- [ ] Stat card numbers
- [ ] Stat card labels (uppercase)
- [ ] All badges (Live, Reported, Estimated)
- [ ] Body text in panels
- [ ] Chart axis labels
- [ ] Chart legends
- [ ] Table headers
- [ ] Table cell content
- [ ] Timestamps
- [ ] Button labels
- [ ] Form labels
- [ ] Dropdown options
- [ ] Empty state messages
- [ ] Placeholder text
- [ ] Icon labels
- [ ] Map legend text
- [ ] Reasoning boxes
- [ ] List items

## Maintenance

### Adding New Components
Always use the CSS variable system:
```tsx
// Good
<p className="text-secondary">Description</p>
<span style={{ color: 'var(--text-primary)' }}>Value</span>

// Avoid
<p className="text-gray-400">Description</p>
<span style={{ color: '#94a3b8' }}>Value</span>
```

### Testing Visibility
1. View page in normal lighting
2. Check with glassmorphism panels active
3. Verify against background patterns
4. Test hover states
5. Check responsive sizes

## What Did NOT Change

- ❌ Font sizes
- ❌ Font weights
- ❌ Layout spacing
- ❌ Component structure
- ❌ Data logic
- ❌ API calls
- ❌ Routing
- ❌ Event handlers

## Impact Summary

**Before:** 
- Inconsistent text colors across components
- Many text elements too dim on glass panels
- Stat labels hard to read
- Chart text barely visible
- Muted text disappeared on dark surfaces

**After:**
- Unified color system with clear hierarchy
- All text comfortably readable at a glance
- Stat labels clearly visible
- Chart text enhanced for readability
- Muted text still visible on glass panels
- No squinting or zooming required

## Browser Compatibility

All changes use standard CSS color values and variables. Works in:
- Chrome/Edge (full support)
- Safari (full support)
- Firefox (full support)
- All modern browsers supporting CSS custom properties
