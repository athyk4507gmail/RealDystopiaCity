# Landing Page Hover Effects Documentation

## Overview
Sophisticated hover effects that reveal ghost text, lift cards, and create engaging micro-interactions throughout the landing page.

## Module Row Hover Effects

### Ghost Text Reveal
The large decorative labels (AI, ML, XGB, 12B, RT, SIM) start nearly invisible and reveal on hover.

**Dark Background (Black)**
- Default: `rgba(255, 255, 255, 0.08)` - Very faint white
- Hover: `rgba(255, 255, 255, 0.95)` - Nearly full white
- Background tint: `rgba(255, 255, 255, 0.02)` on hover

**Light Background (Off-White)**
- Default: `rgba(0, 0, 0, 0.06)` - Very faint black
- Hover: `rgba(0, 0, 0, 0.85)` - Strong black
- Background tint: `rgba(0, 0, 0, 0.02)` on hover

### Text Colors (Always Readable)
**Dark Background:**
- Description: `rgba(255, 255, 255, 0.65)` - Clear readable gray
- Index label: `rgba(255, 255, 255, 0.4)` - Subdued

**Light Background:**
- Description: `rgba(0, 0, 0, 0.6)` - Clear readable gray
- Index label: `rgba(0, 0, 0, 0.4)` - Subdued

### Classes Used
```jsx
<section className="module-row light-bg"> // Add light-bg for off-white sections
  <p className="module-description">...</p>
  <div className="module-index-label">...</div>
  <div className="module-bg-tag">AI</div> // Ghost text that reveals
</section>
```

## Architecture Card Effects

### Lift & Shadow
Cards lift upward on hover with an enhanced shadow.

**Effects:**
- Transform: `translateY(-4px)` - Lifts 4px up
- Shadow: `0 8px 24px rgba(0, 0, 0, 0.15)` - Soft shadow
- Number color: Darkens from `rgba(0, 0, 0, 0.4)` to `rgba(0, 0, 0, 0.9)`

**Duration:** 300ms ease

### Classes Used
```jsx
<div className="arch-card">
  <h3>
    <span className="arch-number">01</span> - Water Layer
  </h3>
</div>
```

## Use Case Card Effects

### Border Glow & Icon Scale
Cards glow with brighter border and icons scale up on hover.

**Effects:**
- Transform: `translateY(-4px)` - Lifts 4px up
- Border: Changes from `rgba(255, 255, 255, 0.1)` to `rgba(255, 255, 255, 0.3)`
- Background: `rgba(255, 255, 255, 0.02)` subtle tint
- Icon scale: `scale(1.1)` - 10% larger

**Duration:** 300ms ease

### Classes Used
```jsx
<div className="use-case-card">
  <div className="use-case-icon">🚑</div>
  <h3>Emergency Response</h3>
</div>
```

## CTA Button Effects

### Primary Button (Filled)
Lifts with shadow on hover, press animation on active.

**Effects:**
- Transform: `translateY(-2px)` - Lifts 2px up
- Shadow: `0 8px 20px rgba(0, 0, 0, 0.2)`
- Background: Darkens to `rgba(0, 0, 0, 0.9)`
- Active: Returns to `translateY(0)` on click

**Duration:** 200ms ease

### Secondary Button (Outlined)
Fills with black background on hover, text turns white.

**Effects:**
- Transform: `translateY(-2px)` - Lifts 2px up
- Background: Changes from transparent to `rgba(0, 0, 0, 1)`
- Color: Changes from black to white
- Active: Returns to `translateY(0)` on click

**Duration:** 200ms ease

### Classes Used
```jsx
<button className="cta-primary">Launch Dashboard</button>
<button className="cta-secondary">Sign In</button>
```

## Animation Timings

### Fast (200ms)
- CTA buttons - Quick response for primary actions

### Medium (300ms)
- Module row background
- Architecture cards
- Use case cards
- Standard card interactions

### Slow (400ms)
- Ghost text color transitions - Smooth reveal effect

## CSS Architecture

All hover effects are defined in `/src/app/globals.css`:

```css
/* Module Rows */
.module-row { ... }
.module-row.light-bg { ... }

/* Architecture Cards */
.arch-card { ... }

/* Use Case Cards */
.use-case-card { ... }

/* CTA Buttons */
.cta-primary { ... }
.cta-secondary { ... }
```

## Design Principles

1. **Subtle at Rest** - Elements don't draw attention when idle
2. **Reveal on Hover** - Ghost text creates surprise and delight
3. **Consistent Physics** - All lifts use 2-4px translateY
4. **Smooth Transitions** - No jarring movements
5. **Contextual Colors** - Dark/light variants for different backgrounds
6. **Always Readable** - Description text never fades completely

## Performance Considerations

- Uses `transform` for animations (GPU accelerated)
- Color transitions on `color` property only
- No layout shifts during hover
- `pointer-events-none` on decorative elements
- Transitions use `ease` for natural feel

## Browser Support

✅ Chrome/Edge (Chromium)
✅ Firefox
✅ Safari
✅ Mobile Safari
✅ Chrome Mobile

All effects use standard CSS properties with wide browser support.

## Accessibility

- Hover effects are purely visual enhancements
- All interactive elements remain accessible without hover
- Focus states work independently of hover states
- Touch devices see cards in their hover state momentarily on tap
- No critical information is revealed only on hover

## Testing Checklist

- [ ] Module rows reveal ghost text smoothly
- [ ] Light background modules use dark ghost text
- [ ] Architecture cards lift and show shadow
- [ ] Use case icons scale on hover
- [ ] Use case borders glow brighter
- [ ] Primary CTA lifts and darkens
- [ ] Secondary CTA fills with black
- [ ] All transitions feel smooth (not too fast/slow)
- [ ] Mobile tap creates momentary hover effect
- [ ] No layout shifts during animations

## Future Enhancements

- [ ] Stagger reveal for module rows (cascade effect)
- [ ] Parallax on large decorative text
- [ ] Cursor trail effect on hero section
- [ ] Scroll-triggered fade-in animations
- [ ] 3D tilt effect on architecture cards
- [ ] Animated gradients on CTA buttons
