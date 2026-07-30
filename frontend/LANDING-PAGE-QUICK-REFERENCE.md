# Landing Page Quick Reference

Quick guide for maintaining and customizing the CityPulse AI landing page.

---

## 🎨 Color Customization

### Change Accent Color (Teal)
Find and replace in `globals.css`:
```css
/* Current: Teal/Cyan */
rgba(94, 234, 212, ...)

/* Example alternatives: */
/* Blue */ rgba(96, 165, 250, ...)
/* Purple */ rgba(168, 85, 247, ...)
/* Green */ rgba(74, 222, 128, ...)
```

### Change Background
```css
/* In globals.css */
body {
  background: #000000; /* Change this */
}

/* In page.tsx sections */
className="bg-black" /* Change to desired color */
```

---

## ⚙️ Animation Speed

### Speed Up/Slow Down Animations

**Brand Glow Pulse** (currently 3s):
```css
animation: brand-glow-pulse 3s ease-in-out infinite;
/* Change to 2s for faster, 4s for slower */
```

**Architecture Wave** (currently 1.8s):
```css
animation: architecture-wave 1.8s ease-in-out infinite;
```

**Use Case Wave** (currently 3s):
```css
.usecase-card {
  animation: usecase-wave 3s ease-in-out infinite;
}
```

### Disable All Animations
Add to `globals.css`:
```css
* {
  animation: none !important;
  transition: none !important;
}
```

---

## 📝 Content Updates

### Update Stats
In `page.tsx`, line ~7:
```typescript
const stats = [
  { value: "6", label: "City modules" },
  { value: "12B", label: "Gemma 4 parameters" },
  { value: "3", label: "AI inference modes" },
  { value: "15m", label: "Live data cache" },
];
```

### Add/Remove Modules
In `page.tsx`, line ~13:
```typescript
const modules = [
  { 
    idx: "/0.1", 
    tag: "/water", 
    title: "Water Distribution", 
    desc: "Description here", 
    big: "AI" 
  },
  // Add more...
];
```

### Update Architecture Cards
In `page.tsx`, line ~22:
```typescript
const architectureCards = [
  { 
    num: "01", 
    title: "Water Layer", 
    sub: "FastAPI + Gemma 4", 
    tags: ["FastAPI", "Gemma4", "Realtime"] 
  },
  // Add more...
];
```

---

## 🔧 Component Customization

### Change CTA Button Text
In `page.tsx`, search for "Launch Dashboard" and "Sign In":
```tsx
<button>Launch Dashboard</button>
<button>Sign In</button>
```

### Update Navigation Links
In `page.tsx`, line ~75:
```tsx
<a href="#modules">Modules</a>
<a href="#architecture">Architecture</a>
<a href="#use-cases">Use Cases</a>
```

### Modify Footer
In `page.tsx`, line ~367:
```tsx
<p>CityPulse AI © 2026 · Sustainable City Intelligence</p>
```

---

## 🎭 Styling Quick Fixes

### Make Text Brighter/Dimmer
```css
/* Current hierarchy */
color: #ffffff;                      /* Full white */
color: rgba(255, 255, 255, 0.6);   /* 60% opacity */
color: rgba(255, 255, 255, 0.3);   /* 30% opacity */

/* To make brighter, increase opacity */
color: rgba(255, 255, 255, 0.8);   /* 80% opacity */
```

### Adjust Card Hover Lift
```css
.arch-card:hover {
  transform: translateY(-8px); /* Current: -8px */
}

/* More subtle: -4px */
/* More dramatic: -12px */
```

### Change Border Opacity
```css
border: 1px solid rgba(255, 255, 255, 0.1);
/* Make more visible: 0.2 or 0.3 */
/* Make less visible: 0.05 */
```

---

## 📐 Layout Adjustments

### Change Grid Columns

**Architecture Cards**:
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {/* Currently: 1 col mobile, 2 tablet, 3 desktop */}
  {/* Change lg:grid-cols-3 to lg:grid-cols-4 for 4 columns */}
</div>
```

**Use Cases**:
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
  {/* Same pattern */}
</div>
```

### Adjust Section Padding
```tsx
className="px-8 md:px-16 py-16"
/* px = horizontal padding */
/* py = vertical padding */
/* Increase numbers for more space */
```

---

## 🚀 Performance Tips

### Reduce Animation Load
1. Lower animation frame rate (change `ease-in-out` to `steps(10)`)
2. Disable animations on mobile:
```css
@media (max-width: 768px) {
  .arch-card,
  .usecase-card {
    animation: none !important;
  }
}
```

### Optimize Images (if added)
```tsx
import Image from 'next/image';

<Image
  src="/path/to/image.jpg"
  alt="Description"
  width={800}
  height={600}
  priority={true} // For above-the-fold images
/>
```

---

## 🐛 Common Issues & Fixes

### Issue: Brand text not glowing
**Fix**: Check that both classes are applied:
```tsx
<span className="citypulse-brand-text">CityPulse AI</span>
```

### Issue: Cards not floating
**Fix**: Ensure animation is not paused:
```css
.arch-card {
  animation: architecture-wave 1.8s ease-in-out infinite;
  /* Remove any animation-play-state: paused; */
}
```

### Issue: Hover effects not working
**Fix**: Check CSS specificity and ensure no conflicting styles:
```css
.stat-card-hover:hover {
  transform: translateY(-4px) !important; /* Add !important if needed */
}
```

### Issue: Text not visible
**Fix**: Check color contrast:
```css
/* Ensure sufficient opacity */
color: rgba(255, 255, 255, 0.6); /* Minimum for readability */
```

---

## 📱 Mobile Testing

### Test on these breakpoints:
- 375px (iPhone SE)
- 390px (iPhone 12/13/14)
- 768px (iPad)
- 1024px (Desktop)

### Common mobile adjustments:
```css
@media (max-width: 640px) {
  .hero-title {
    font-size: 2.5rem; /* Smaller on mobile */
  }
  
  .stat-value {
    font-size: 3rem; /* Reduce stat numbers */
  }
}
```

---

## 🎯 A/B Testing Ideas

### Headline Variations
```tsx
{/* Current */}
<h1>Unified intelligence for sustainable cities.</h1>

{/* Test variations */}
<h1>AI-Powered City Intelligence Platform</h1>
<h1>Transform Your City with AI</h1>
```

### CTA Button Variations
```tsx
{/* Current */}
<button>Launch Dashboard</button>

{/* Test variations */}
<button>Get Started Free</button>
<button>See Demo</button>
<button>Try CityPulse AI</button>
```

---

## 🔍 SEO Checklist

### Meta Tags (add to head)
```tsx
<meta name="description" content="CityPulse AI - Unified intelligence platform for sustainable cities. Water distribution, traffic management, and city metabolism powered by Google Gemma 4." />
<meta name="keywords" content="city AI, urban intelligence, smart city, Gemma 4, traffic management" />
```

### Structured Data
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "CityPulse AI",
  "description": "Unified intelligence for sustainable cities",
  "applicationCategory": "BusinessApplication"
}
```

---

## 🛠️ Developer Tools

### Chrome DevTools Tips
1. **Toggle device toolbar** (Cmd+Shift+M) for mobile view
2. **Inspect animations** (Cmd+Shift+P → "Show Animations")
3. **Check performance** (Lighthouse tab)
4. **Test accessibility** (Lighthouse → Accessibility)

### Useful VS Code Extensions
- Tailwind CSS IntelliSense
- CSS Peek
- Error Lens
- Prettier

---

## 📚 File Locations

### Key Files
```
frontend/
├── src/app/globals.css              # All custom CSS
├── src/app/(public)/landing/page.tsx  # Landing page component
├── LANDING-DARK-THEME-UPDATES.md    # Detailed changelog
├── LANDING-PAGE-FINAL-SUMMARY.md    # Complete documentation
└── LANDING-PAGE-QUICK-REFERENCE.md  # This file
```

### Where to Find Specific Styles
- Brand glow: `globals.css` line ~47
- Architecture cards: `globals.css` line ~220
- Core pipeline: `globals.css` line ~83
- Stats hover: `globals.css` line ~70
- Use case cards: `globals.css` line ~555

---

## 💡 Pro Tips

1. **Always test in incognito** to avoid cache issues
2. **Use CSS variables** for easy theme changes
3. **Comment your code** for future reference
4. **Keep animations subtle** for professional feel
5. **Test with actual content** before going live

---

## 🆘 Need Help?

### Resources
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Next.js Docs](https://nextjs.org/docs)
- [CSS Tricks](https://css-tricks.com)
- [MDN Web Docs](https://developer.mozilla.org)

### Common Commands
```bash
# Development server
npm run dev

# Production build
npm run build

# Start production server
npm start

# Check for errors
npm run lint
```

---

**Quick Reference Version**: 1.0.0
**Last Updated**: January 2025

Happy coding! 🚀
