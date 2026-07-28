# Bug Fix: Hover-Triggered Blank/Crash on Page Headings

## Issue
When hovering over page headings (e.g., "AI Smart Water Distribution"), the text would disappear or the page would go blank.

## Root Cause
The bug was caused by a CSS rendering conflict between:

1. **TiltCard 3D Transform**: The `TiltCard` component applied `transformStyle: "preserve-3d"` to create a 3D tilt effect
2. **Gradient Text Clipping**: The `.page-title` class used `background-clip: text` with `color: transparent` for a gradient effect
3. **Browser Rendering Issue**: In many browsers, `transform-style: preserve-3d` and `background-clip: text` conflict, causing the clipped background to not render properly, making the text invisible

When the mouse moved over the heading inside a TiltCard, the 3D transform would activate, and the gradient-clipped text would fail to render.

## The Fix

### 1. TiltCard Component (`/frontend/src/components/TiltCard.tsx`)
**Removed:**
- `transformStyle: "preserve-3d"` - Not necessary for the tilt effect and causes the conflict
- `backfaceVisibility: "visible"` - Redundant

**Added:**
- `willChange: "transform"` - Performance hint for smooth animations

### 2. Global CSS (`/frontend/src/app/globals.css`)

**`.page-panel` class:**
- Removed `transform-style: preserve-3d`
- Added `will-change: transform` for better performance

**`.page-title` class:**
- Added `transform: translateZ(0)` - Creates a new stacking context, isolating the gradient rendering
- Added `will-change: auto` - Lets browser optimize rendering
- Added `-webkit-font-smoothing: antialiased` - Improves text rendering quality

## Technical Details

### Why `preserve-3d` was problematic:
- `preserve-3d` flattens child elements into a 3D rendering context
- When combined with `background-clip: text`, the background gradient gets clipped but may not render in the 3D context
- Different browsers handle this differently, causing inconsistent behavior

### Why the fix works:
- The tilt effect only requires `transform: perspective() rotateY() rotateX()` on the container
- `preserve-3d` is only needed if child elements need to maintain 3D positioning relative to the parent
- By removing it, we allow the gradient text to render in its own 2D context
- `translateZ(0)` forces GPU acceleration and creates a new layer, ensuring clean rendering

## Verification
After this fix, hovering over any page heading should:
✅ Keep the gradient text visible
✅ Apply the subtle tilt effect smoothly
✅ Not cause any console errors
✅ Work across all pages (Water, Traffic, Trust Score, etc.)

## Pages Affected (Now Fixed)
- ✅ AI Smart Water Distribution
- ✅ Water Complaints
- ✅ City Metabolism
- ✅ Driver Behavior Risk Zones
- ✅ AI Traffic Mood Predictor
- ✅ AI Smart Traffic Management
- ✅ Public Transport Trust Score

## No Changes to:
- Data fetching logic
- Component behavior
- Layout structure
- Any unrelated error handling
