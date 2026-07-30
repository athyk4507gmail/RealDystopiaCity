# Landing Page Quick Start Guide

## 🚀 Overview

Your CityPulse AI landing page is a production-ready, brutalist-style single-page application with:
- **Zero dependencies** for animations (pure CSS)
- **Fully responsive** mobile-first design
- **Sophisticated hover effects** including ghost text reveals
- **SEO optimized** with Open Graph and structured data
- **Accessible** (WCAG AA compliant)
- **Performant** (60fps animations, <3s load)

## 📁 File Structure

```
/frontend
├── /src/app/(public)
│   ├── layout.tsx              # Metadata & SEO
│   ├── /landing
│   │   ├── page.tsx            # Main landing page
│   │   └── schema.json         # Structured data
│   └── /signin
│       └── page.tsx            # Sign-in page
├── /src/app
│   └── globals.css             # All landing styles
└── /public
    └── logo-citypulse.png      # Logo/favicon
```

## ⚡ Quick Commands

```bash
# Development
npm run dev

# Production build
npm run build
npm start

# Lint & Type Check
npm run lint
npm run type-check
```

## 🎨 Customizing Content

### Update Stats
Edit in `/src/app/(public)/landing/page.tsx`:

```typescript
const stats = [
  { value: "6", label: "City modules" },
  { value: "12B", label: "Gemma 4 parameters" },
  // Add more stats...
];
```

### Update Modules
```typescript
const modules = [
  { 
    idx: "/0.1", 
    tag: "/water", 
    title: "Water Distribution", 
    desc: "AI scheduling, leakage detection...", 
    big: "AI",     // Ghost text
    dark: false    // Background color
  },
  // Add more modules...
];
```

### Update Architecture Cards
```typescript
const architectureCards = [
  { 
    num: "01", 
    title: "Water Layer", 
    sub: "FastAPI + Gemma 4", 
    tags: ["FastAPI", "Gemma4", "Realtime"] 
  },
  // Add more cards...
];
```

## 🎯 Modifying Colors

### Background Colors
In `/src/app/(public)/landing/page.tsx`:

```tsx
// Black background
className="bg-black"

// Off-white background
className="bg-[#f2f1ea]"
```

### Ghost Text Opacity
In `/src/app/globals.css`:

```css
.module-row .module-bg-title {
  color: rgba(255, 255, 255, 0.08);  /* Default: faint */
}

.module-row:hover .module-bg-title {
  color: rgba(255, 255, 255, 0.95);  /* Hover: bright */
}
```

## 🖱️ Adding New Sections

### Template
```tsx
{/* NEW SECTION */}
<section 
  id="new-section" 
  className="bg-black px-8 md:px-16 py-16 border-t border-white/10 scroll-mt-20"
>
  <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-16">
    Section Title
  </h1>
  
  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
    {/* Content here */}
  </div>
</section>
```

### Add to Navigation
```tsx
<a href="#new-section" className="text-sm text-white/60 hover:text-white transition-colors">
  New Section
</a>
```

## 🎭 Custom Hover Effects

### Add New Hover Class
In `/src/app/globals.css`:

```css
.custom-card {
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.custom-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}
```

### Use in Component
```tsx
<div className="custom-card">
  {/* Content */}
</div>
```

## 📱 Responsive Breakpoints

```css
/* Mobile (default) */
className="text-5xl"

/* Tablet (640px+) */
className="sm:text-6xl"

/* Desktop (1024px+) */
className="md:text-7xl"
```

## 🔗 Common Tasks

### Change CTA Links
```tsx
<Link href="/water">              {/* Change destination */}
  <button>Launch Dashboard</button>
</Link>
```

### Update Logo
Replace `/public/logo-citypulse.png` with your logo (8x8 display size)

### Change Brand Name
Search and replace "CityPulse AI" throughout files

### Modify Animation Timing
In `/src/app/globals.css`:

```css
@keyframes fadeInUp {
  /* Adjust timing */
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-fade-in-up {
  animation: fadeInUp 0.8s ease-out forwards; /* Change 0.8s */
}
```

## 🐛 Troubleshooting

### Animations Not Working
- Check CSS is imported in layout
- Verify class names match globals.css
- Check browser console for errors

### Hover Effects Not Smooth
- Ensure using `transform` not `top/left`
- Check transition durations
- Test in Chrome DevTools Performance

### Scroll Not Smooth
- Verify `scroll-behavior: smooth` in CSS
- Check JavaScript scroll functions
- Test in different browsers

### Mobile Layout Issues
- Verify responsive classes (sm:, md:, lg:)
- Test in Chrome DevTools device mode
- Check viewport meta tag

## 📊 Testing Checklist

```bash
# Test responsiveness
# Open in Chrome DevTools → Toggle device toolbar
# Test at: 375px (mobile), 768px (tablet), 1440px (desktop)

# Test performance
# Run Lighthouse in Chrome DevTools
# Target scores: Performance >90, Accessibility 100, Best Practices >90, SEO 100

# Test animations
# Hover over all interactive elements
# Check scroll-triggered effects
# Verify no layout shift

# Test accessibility
# Tab through all interactive elements
# Test with screen reader (macOS VoiceOver: Cmd+F5)
# Verify color contrast
```

## 🚢 Pre-Deploy Checklist

- [ ] Update all placeholder text
- [ ] Replace logo with final version
- [ ] Create OG image (1200x630px)
- [ ] Test all links
- [ ] Run Lighthouse audit (all scores >90)
- [ ] Test on real mobile device
- [ ] Verify metadata in `<head>`
- [ ] Check console for errors
- [ ] Test in Safari, Chrome, Firefox
- [ ] Review responsive breakpoints

## 📚 Key Documentation

1. **LANDING-PAGE-OVERVIEW.md** - Full design system
2. **LANDING-HOVER-EFFECTS.md** - Hover effect guide
3. **LANDING-FINAL-FEATURES.md** - Complete feature list
4. **SEO-DEPLOYMENT-GUIDE.md** - SEO & deployment

## 💡 Pro Tips

### Smooth Development
- Use hot reload: Changes appear instantly
- Keep Chrome DevTools open
- Use React DevTools for debugging

### Performance
- Avoid inline styles (use Tailwind classes)
- Use `transform` for animations
- Minimize re-renders

### Consistency
- Follow existing naming patterns
- Match spacing/sizing scales
- Maintain color system

### Accessibility
- Always add ARIA labels to icon buttons
- Maintain heading hierarchy
- Test keyboard navigation

## 🎓 Learning Resources

- **Tailwind CSS**: https://tailwindcss.com/docs
- **Next.js**: https://nextjs.org/docs
- **CSS Animations**: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Animations
- **Accessibility**: https://www.w3.org/WAI/WCAG21/quickref/

## 🆘 Need Help?

1. Check existing documentation
2. Review commit history
3. Search GitHub issues
4. Ask team on Slack
5. Create detailed issue with:
   - Expected behavior
   - Actual behavior
   - Steps to reproduce
   - Screenshots
   - Browser/OS info

---

**Built with ❤️ for CityPulse AI**
