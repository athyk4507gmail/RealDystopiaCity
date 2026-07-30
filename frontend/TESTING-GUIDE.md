# 🧪 CityPulse AI Landing Page - Testing Guide

**Server**: ✅ Running on `http://localhost:3010`  
**Status**: Ready for testing  
**Date**: January 2026

---

## 🚀 Quick Start

### Access the Landing Page
```
http://localhost:3010/landing
```

**Alternative URL**: `http://10.0.26.209:3010/landing` (network access)

---

## ✅ Visual Testing Checklist

### 1. **Navigation Bar** (Top)
- [ ] **Initial state**: Transparent background
- [ ] **Scroll down 50px**: Blur effect activates
- [ ] **Hover links**: Text changes from gray to white
- [ ] **Click "Sign In"**: Button has glass border
- [ ] **Smooth scroll**: Click "Architecture" → smooth scroll to section

**What to look for:**
- Glassmorphism blur appears smoothly
- No jarring transitions
- Text remains readable

---

### 2. **Hero Section** (Top of page)

#### Brand Text Animation
- [ ] **"CityPulse AI"**: 2.5rem size, larger than rest of page
- [ ] **3D flip animation**: Text rotates 20deg every 3.5s
- [ ] **Teal glow**: 4 layers of glowing shadow
- [ ] **Smooth animation**: No stuttering or jumping

#### Hero Content
- [ ] **Main heading**: "Unified intelligence for sustainable cities"
- [ ] **Fade-in sequence**: Each element appears with 100ms delay
- [ ] **Buttons**: "Launch Dashboard" + "View Architecture"
- [ ] **Stats row**: 4 stats (6, 12B, 3, 15m)

**What to look for:**
- Brand animation runs continuously
- Glow pulses smoothly
- All text is sharp and readable

---

### 3. **Stats Row** (Below hero)
- [ ] **Hover each stat**: Card lifts slightly
- [ ] **Value changes color**: Becomes teal with glow
- [ ] **Smooth transition**: No jerky movements

**Stats to verify:**
1. "6" → City modules
2. "12B" → Gemma 4 parameters
3. "3" → AI inference modes
4. "15m" → Live data cache

---

### 4. **Modules Section** (6 rows)

#### Wave Animation
- [ ] **Continuous wave**: Each row floats up/down (6px)
- [ ] **Staggered timing**: Each row starts 0.2s after previous
- [ ] **3-second cycle**: Smooth, gentle movement

#### Hover Effects
- [ ] **Background brightens**: Black → 8% white
- [ ] **Ghost text reveals**: Large "AI", "ML", "XGB" text appears
- [ ] **Text becomes white**: Full opacity with soft glow

**Rows to test:**
1. Water Distribution (AI)
2. Trust Score (ML)
3. Risk Zones (XGB)
4. Traffic Mood (12B)
5. Traffic Management (RT)
6. City Metabolism (SIM)

---

### 5. **Architecture Section** (6 cards)

#### Wave Animation
- [ ] **Faster wave**: 1.8s cycle (vs 3s for modules)
- [ ] **8px lift**: More pronounced than modules
- [ ] **Staggered delays**: 0.1s between cards

#### Card Design
- [ ] **Glassmorphism**: Semi-transparent with blur
- [ ] **Hover lift**: Card rises -4px
- [ ] **Border glow**: White border brightens
- [ ] **Tags visible**: Black pills with tech names

**Cards to verify:**
1. 01 - Water Layer
2. 02 - Reasoning Layer
3. 03 - Data Layer
4. 04 - Orchestration
5. 05 - Delivery
6. 06 - Output

---

### 6. **Core Pipeline** (6 steps)

#### Visual Check
- [ ] **Black background**: Pure #000000
- [ ] **Step numbers**: Gray (30% white)
- [ ] **Step titles**: Full white, bold
- [ ] **Descriptions**: Gray (60% white)
- [ ] **All text readable**: Good contrast

**Steps to verify:**
1. 01 - User Query
2. 02 - Gemma 4 Reasoning
3. 03 - Module Processing
4. 04 - ML Scoring
5. 05 - Map Visualization
6. 06 - AI Chat Response

---

### 7. **Tech Stack Section** (3 glass cards)

#### Card Hover
- [ ] **Lift effect**: Card rises -4px
- [ ] **Background brightens**: 4% → 7% white
- [ ] **Border glow**: More prominent
- [ ] **Shadow deepens**: Stronger 3D effect

#### List Item Hover
- [ ] **Text brightens**: 65% → 100% white
- [ ] **Slide animation**: Moves right 4px
- [ ] **Independent**: Each item animates separately

**Cards to test:**
1. **Frontend**: Next.js, React, TypeScript...
2. **Backend**: FastAPI, Python, PostgreSQL...
3. **AI & ML**: Gemma 4, XGBoost...

---

### 8. **Key Capabilities Section** (6 cards)

#### Entrance Animation
- [ ] **Staggered fade-in**: Each card appears with 0.1s delay
- [ ] **Slide up**: Cards start 20px below, move to position
- [ ] **Smooth entrance**: No popping or jumping

#### Icon Animation
- [ ] **Large emoji**: 3rem size with drop shadow
- [ ] **Hover scale**: Grows to 115%
- [ ] **3D rotation**: rotateY(15deg)
- [ ] **Glow intensifies**: Teal shadow brightens

#### Wave Sweep Effect
- [ ] **Hover card**: Teal gradient sweeps across (left to right)
- [ ] **Title turns teal**: With text shadow glow
- [ ] **Description brightens**: 65% → 85% white

**Cards with icons:**
1. ⚡ Real-time Data Integration
2. 🗺️ Spatial Intelligence
3. 🧠 AI-Powered Reasoning
4. 📊 Predictive Analytics
5. 🔄 Cross-System Simulation
6. 📍 Interactive Visualization

---

### 9. **Use Cases Section** (6 cards)

#### Wave Animation
- [ ] **3-second cycle**: Slower than architecture
- [ ] **10px lift**: Largest movement of all cards
- [ ] **Staggered**: 0.15s between cards

#### Hover Effects
- [ ] **Background brightens**: 3% → 12% white
- [ ] **Icon scales**: Emoji grows 110%
- [ ] **Text brightens**: Title + description

**Cards to test:**
1. 🚑 Emergency Response
2. 💧 Water Management
3. 🚦 Traffic Optimization
4. ⚠️ Risk Assessment
5. 🚌 Public Transit
6. 🏙️ City Planning

---

### 10. **CTA Section** (2 premium buttons)

#### Primary Button ("Launch Dashboard")
- [ ] **White gradient**: Clean, bright background
- [ ] **Shimmer animation**: Light sweeps across every 3s
- [ ] **Pulsing glow**: Shadow pulses continuously
- [ ] **Hover effect**: Lifts -3px, scales 102%
- [ ] **Arrow animation**: Slides right 4px on hover

#### Secondary Button ("Sign In")
- [ ] **Glass design**: Transparent with blur
- [ ] **Wave sweep**: Teal gradient on hover
- [ ] **Border glow**: Changes to teal on hover
- [ ] **Text color**: Changes to teal on hover

**Heading to verify:**
- Gradient text: "Ready to transform your city?"
- Smooth color blend (white → light gray)

---

### 11. **Footer** (4-column layout)

#### Brand Column
- [ ] **Animated icon**: ⚡ pulses with teal glow (3s)
- [ ] **Brand text**: "CityPulse AI" in white
- [ ] **Tagline**: Teal color
- [ ] **Description**: Gray text

#### Link Columns
- [ ] **3 columns**: Platform, Resources, Company
- [ ] **Hover effect**: Link slides right 4px + teal glow
- [ ] **Smooth transition**: 0.2s ease

#### Footer Bottom
- [ ] **Gradient divider**: Subtle line separator
- [ ] **Copyright**: Gray text, centered
- [ ] **Badge pills**: "Gemma 4" + "Open Source"
- [ ] **Badge hover**: Lifts -2px with glow

---

### 12. **Scroll-to-Top Button** (Floating FAB)

#### Appearance
- [ ] **Scroll down 500px**: Button fades in smoothly
- [ ] **Glass design**: Transparent circle with blur
- [ ] **Pulsing glow**: Teal shadow animates (3s)
- [ ] **Fixed position**: Bottom-right corner

#### Interactions
- [ ] **Hover**: Lifts -4px, scales 105%, teal border
- [ ] **Tooltip appears**: "Back to top" (desktop only)
- [ ] **Click**: Smooth scroll to top
- [ ] **Icon slides up**: Arrow moves -2px on hover

---

## 📱 Responsive Testing

### Mobile (375px - iPhone SE)
```
1. Resize browser to 375px width
2. Check these sections:
```

- [ ] **Navigation**: Horizontal scroll or menu works
- [ ] **Hero**: Single column, reduced text size
- [ ] **Stats**: 2x2 grid (not 4 columns)
- [ ] **Modules**: Single column, full width
- [ ] **Architecture**: Single column cards
- [ ] **Tech Stack**: Single column stack
- [ ] **Capabilities**: Single column, reduced padding
- [ ] **CTA buttons**: Full width, stacked
- [ ] **Footer**: Single column layout
- [ ] **Scroll button**: Smaller (48px), no tooltip

### Tablet (768px - iPad)
```
1. Resize browser to 768px width
2. Check these sections:
```

- [ ] **Stats**: 4 columns maintained
- [ ] **Tech Stack**: 3 columns maintained
- [ ] **Capabilities**: 2 columns
- [ ] **Footer**: 2 columns (brand spans full width)
- [ ] **Text sizes**: Medium scale
- [ ] **Spacing**: Comfortable padding

### Desktop (1440px - MacBook Pro)
```
1. Resize browser to 1440px width
2. Verify optimal layout:
```

- [ ] **All sections centered**: Max-width containers
- [ ] **Full grid layouts**: 3-4 columns where applicable
- [ ] **Large text**: Maximum heading sizes
- [ ] **Proper spacing**: Generous padding/margins
- [ ] **Crisp animations**: Smooth 60fps

---

## ⚡ Performance Testing

### Animation Performance
```
1. Open Chrome DevTools (Cmd+Opt+I)
2. Go to Performance tab
3. Record while scrolling page
```

**Check for:**
- [ ] **60 FPS maintained**: No frame drops
- [ ] **No layout shifts**: CLS score = 0
- [ ] **GPU acceleration**: Transforms use compositing
- [ ] **No jank**: Smooth scrolling throughout

### Load Performance
```
1. Open DevTools → Lighthouse tab
2. Run audit (Desktop mode)
```

**Target scores:**
- [ ] **Performance**: 90+
- [ ] **Accessibility**: 95+
- [ ] **Best Practices**: 90+
- [ ] **SEO**: 90+

**Key metrics:**
- [ ] **First Contentful Paint**: <1.5s
- [ ] **Time to Interactive**: <3s
- [ ] **Cumulative Layout Shift**: 0
- [ ] **Total Blocking Time**: <300ms

---

## ♿ Accessibility Testing

### Keyboard Navigation
```
1. Tab through entire page (don't use mouse)
```

- [ ] **Visible focus**: Teal outline (2px) on all elements
- [ ] **Logical order**: Navigation → Hero → Sections → Footer
- [ ] **Skip links**: Can jump to main content
- [ ] **Button activation**: Enter/Space keys work

### Screen Reader Testing (Optional)
```
1. Enable VoiceOver (Cmd+F5 on Mac)
2. Navigate page with cursor
```

- [ ] **Headings**: Proper h1, h2, h3 hierarchy
- [ ] **Buttons**: Labeled with purpose
- [ ] **Links**: Descriptive text (not "click here")
- [ ] **Images**: Alt text for emoji/icons

### Reduced Motion
```
1. System Preferences → Accessibility → Display → Reduce Motion
2. Or DevTools → Rendering → Emulate CSS prefers-reduced-motion
```

- [ ] **All animations disabled**: No wave, no flip, no pulse
- [ ] **Page still functional**: Layout intact
- [ ] **Smooth scroll maintained**: Basic navigation works

---

## 🐛 Bug Checklist

### Visual Bugs
- [ ] No text overlapping other text
- [ ] No cut-off content at edges
- [ ] Images/icons load correctly
- [ ] No FOUC (flash of unstyled content)
- [ ] All fonts load properly

### Animation Bugs
- [ ] No infinite spinning/looping errors
- [ ] Animations pause when tab inactive
- [ ] No stuttering on hover
- [ ] Waves don't interfere with each other
- [ ] Hover states reset properly

### Interaction Bugs
- [ ] Buttons clickable throughout
- [ ] Links navigate correctly
- [ ] Scroll-to-top always works
- [ ] No double-click required
- [ ] No delays in hover effects

---

## 🎯 Feature Verification

### All Features Present
- [ ] ✅ 11 major sections
- [ ] ✅ Brand 3D flip animation
- [ ] ✅ Wave animations (3 types)
- [ ] ✅ Glassmorphism treatment
- [ ] ✅ Tech Stack cards
- [ ] ✅ Capabilities cards
- [ ] ✅ Premium CTA buttons
- [ ] ✅ Interactive footer
- [ ] ✅ Scroll-to-top FAB
- [ ] ✅ Page load animation

### Animations Working
- [ ] ✅ 3D brand flip (3.5s cycle)
- [ ] ✅ Module wave (3s, 6px)
- [ ] ✅ Architecture wave (1.8s, 8px)
- [ ] ✅ Use case wave (3s, 10px)
- [ ] ✅ Capability entrance (staggered)
- [ ] ✅ CTA shimmer (3s)
- [ ] ✅ CTA pulse (3s)
- [ ] ✅ Footer icon pulse (3s)
- [ ] ✅ Scroll-to-top pulse (3s)

---

## 📊 Browser Compatibility

### Test in Each Browser
- [ ] **Chrome**: Latest version
- [ ] **Safari**: Latest version
- [ ] **Firefox**: Latest version
- [ ] **Edge**: Latest version

### Check These Features
- [ ] Glassmorphism (backdrop-filter)
- [ ] 3D transforms (perspective, rotateY)
- [ ] CSS animations
- [ ] Smooth scrolling
- [ ] Gradient text

---

## ✅ Final Sign-Off

### Before Marking Complete
- [ ] All sections visible and styled correctly
- [ ] All animations running smoothly
- [ ] Responsive layouts working
- [ ] No console errors
- [ ] No 404s for assets
- [ ] Performance acceptable (60fps)
- [ ] Accessibility compliant

### Ready for Production
- [ ] Visual testing ✅
- [ ] Responsive testing ✅
- [ ] Performance testing ✅
- [ ] Accessibility testing ✅
- [ ] Browser testing ✅
- [ ] Bug fixes complete ✅

---

## 🚀 Next Steps After Testing

### If Everything Works
1. **Document any issues** in a new file
2. **Run Lighthouse audit** and save report
3. **Take screenshots** of key sections
4. **Deploy to staging** environment
5. **Share with stakeholders** for feedback

### If Issues Found
1. **List all bugs** with screenshots
2. **Prioritize**: Critical → High → Medium → Low
3. **Create GitHub issues** (if using version control)
4. **Fix critical bugs** first
5. **Re-test** after fixes

---

## 📞 Support

### Resources
- **Main docs**: `/frontend/LANDING-PREMIUM-COMPLETE.md`
- **Quick reference**: `/frontend/LANDING-PAGE-QUICK-REFERENCE.md`
- **Accomplishments**: `/frontend/ACCOMPLISHMENTS.md`

### Commands
```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Check for type errors
npm run type-check

# Lint code
npm run lint
```

---

**Testing Status**: ⏳ In Progress  
**Server**: http://localhost:3010/landing  
**Last Updated**: January 2026

---

## 🎉 Good luck with testing!

Take your time, test thoroughly, and enjoy the premium animations! 🚀✨
