# OG Image Generation Guide

## 🎨 Create Your Open Graph Image

Your landing page needs a 1200x630px OG image at `/public/og-image.png` for social media previews.

---

## ✅ Three Methods to Create It

### Method 1: Screenshot HTML Template (Easiest)

1. **Open the template:**
   ```bash
   open scripts/og-image-template.html
   ```
   Or open `scripts/og-image-template.html` in your browser

2. **Take a screenshot:**
   - **Mac:** Press `Cmd + Shift + 4`, then press `Space`, click window (or use browser dev tools)
   - **Windows:** Use Snipping Tool or browser dev tools
   - **Browser DevTools:** 
     - Open DevTools (F12)
     - Toggle device toolbar (Cmd/Ctrl + Shift + M)
     - Set dimensions to 1200 x 630
     - Take screenshot: `Cmd/Ctrl + Shift + P` → "Capture screenshot"

3. **Save the file:**
   - Save as `og-image.png` 
   - Move to `/public/og-image.png`

✅ **Done!**

---

### Method 2: Use Node Canvas (Programmatic)

1. **Install canvas library:**
   ```bash
   npm install canvas
   ```

2. **Run the generator:**
   ```bash
   node scripts/generate-og-image.js
   ```

3. **Verify:**
   ```bash
   ls -lh public/og-image.png
   ```

✅ **Done!**

---

### Method 3: Design Tool (Most Flexible)

Use Figma, Canva, or Photoshop with these specs:

**Specifications:**
- **Dimensions:** 1200 x 630 pixels (exact)
- **Format:** PNG or JPG
- **File Size:** < 500KB recommended
- **Color Mode:** RGB
- **Background:** Black (#000000)

**Design Elements:**
- Logo/Brand: "CityPulse AI" (large, bold, white)
- Tagline: "Unified Intelligence for Sustainable Cities"
- Stats: "6 City Modules · 12B Parameters · 3 AI Modes"
- Badge: "Powered by Google Gemma 4"
- Background: Pure black with subtle grid pattern
- Border: 2px white at 10% opacity

**Safe Zones:**
- Keep important content 80px from edges
- Text should be at least 24px for readability
- High contrast (white on black) for clarity

**Export Settings:**
- PNG: 24-bit, no transparency
- JPG: 90% quality minimum
- Optimize for web

**Save to:**
```
/public/og-image.png
```

✅ **Done!**

---

## 🧪 Test Your OG Image

### Online Tools
1. **Open Graph Debugger**
   - https://www.opengraph.xyz/
   - Enter your URL
   - See preview

2. **Facebook Debugger**
   - https://developers.facebook.com/tools/debug/
   - Check Facebook preview

3. **Twitter Card Validator**
   - https://cards-dev.twitter.com/validator
   - Check Twitter preview

4. **LinkedIn Post Inspector**
   - https://www.linkedin.com/post-inspector/
   - Check LinkedIn preview

### Local Testing
```bash
# Verify file exists
ls -lh public/og-image.png

# Check dimensions (requires imagemagick)
identify public/og-image.png

# Should output: og-image.png PNG 1200x630 ...
```

---

## 📐 OG Image Specifications

### Standard Dimensions
- **Recommended:** 1200 x 630 px (1.91:1 ratio)
- **Minimum:** 600 x 315 px
- **Maximum:** 8 MB file size

### Platform-Specific
| Platform | Ideal Size | Aspect Ratio |
|----------|-----------|--------------|
| Facebook | 1200 x 630 | 1.91:1 |
| Twitter | 1200 x 675 | 16:9 |
| LinkedIn | 1200 x 627 | 1.91:1 |
| WhatsApp | 1200 x 630 | 1.91:1 |

**Our 1200x630 works for all platforms!**

---

## 🎨 Design Tips

### Typography
- **Title:** 80-120px, bold, high contrast
- **Subtitle:** 40-60px, medium weight
- **Stats/Details:** 20-40px

### Colors
- **Background:** Pure black (#000000) - matches landing page
- **Primary Text:** White (#FFFFFF)
- **Secondary Text:** White 60% opacity
- **Accents:** White 40% opacity

### Layout
- **Left-aligned** content (easier to read)
- **Generous padding** (80px minimum)
- **Clear hierarchy** (big title → tagline → details)
- **Visual balance** (don't crowd one side)

### Branding
- Include your logo (if you have one)
- Match landing page aesthetic (brutalist minimal)
- Keep it clean and professional
- Avoid clutter

---

## 🚫 Common Mistakes to Avoid

❌ Wrong dimensions (must be exactly 1200x630)
❌ File too large (keep under 500KB)
❌ Text too small (minimum 20px)
❌ Low contrast (black on dark gray won't show)
❌ Too much text (keep it scannable)
❌ Important content at edges (use safe zones)
❌ Wrong file format (use PNG or JPG, not SVG)
❌ Transparency (social platforms don't support it)

---

## ✅ Quality Checklist

Before finalizing your OG image:

- [ ] Dimensions are exactly 1200 x 630 pixels
- [ ] File size is under 500KB
- [ ] File is named `og-image.png`
- [ ] File is in `/public/` directory
- [ ] Text is readable at thumbnail size
- [ ] High contrast (white on black)
- [ ] No important content cut off at edges
- [ ] Looks good on both light and dark backgrounds
- [ ] Matches landing page branding
- [ ] Tested on at least one platform

---

## 🔗 How It's Used

### In Your Code
```tsx
// src/app/(public)/layout.tsx
export const metadata = {
  openGraph: {
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'CityPulse AI - Unified Intelligence for Sustainable Cities',
      },
    ],
  },
  twitter: {
    images: ['/og-image.png'],
  },
};
```

### When It Appears
- **Social media posts** (Facebook, LinkedIn, Twitter)
- **Chat apps** (WhatsApp, Slack, Discord)
- **Link previews** (Email clients, browsers)
- **Search results** (Google social cards)

---

## 📱 Preview Examples

### Facebook/LinkedIn
```
┌─────────────────────────────────────┐
│  [OG Image: 1200x630]               │
│  CityPulse AI                       │
│  Unified Intelligence for           │
│  Sustainable Cities                 │
├─────────────────────────────────────┤
│ CityPulse AI Landing Page           │
│ Transform your city with AI-powered │
│ infrastructure intelligence         │
└─────────────────────────────────────┘
```

### Twitter
```
┌─────────────────────────────────────┐
│  [OG Image: 1200x630]               │
│  CityPulse AI                       │
├─────────────────────────────────────┤
│ CityPulse AI Landing Page           │
│ citypulse.ai                        │
└─────────────────────────────────────┘
```

---

## 🛠️ Troubleshooting

### Image Not Showing
1. **Clear cache:** Social platforms cache aggressively
   - Use debugger tools to force refresh
   - Wait 24 hours for natural cache expiry

2. **Check file path:** Must be `/public/og-image.png`
   ```bash
   ls -la public/og-image.png
   ```

3. **Verify metadata:** Check layout.tsx has correct OG tags

4. **Test URL:** Make sure site is deployed and accessible

### Wrong Dimensions
```bash
# Check current dimensions
identify public/og-image.png

# Resize with ImageMagick
convert public/og-image.png -resize 1200x630! public/og-image.png
```

### File Too Large
```bash
# Optimize PNG
pngcrush -rem gAMA -rem cHRM -rem iCCP -rem sRGB public/og-image.png temp.png
mv temp.png public/og-image.png

# Or convert to JPG
convert public/og-image.png -quality 85 public/og-image.jpg
```

---

## 🎯 Quick Start (Recommended)

**Fastest method:**

1. Open `scripts/og-image-template.html` in Chrome
2. Press F12 to open DevTools
3. Press Cmd/Ctrl + Shift + M for device toolbar
4. Set dimensions: 1200 x 630
5. Press Cmd/Ctrl + Shift + P
6. Type "Capture screenshot" and press Enter
7. Save as `og-image.png` in `/public/` folder

**Done in 2 minutes!** ⚡

---

## 📚 Additional Resources

### Tools
- **Figma:** https://figma.com (free design tool)
- **Canva:** https://canva.com (templates available)
- **ImageMagick:** https://imagemagick.org (CLI tool)
- **GIMP:** https://gimp.org (free Photoshop alternative)

### References
- Open Graph Protocol: https://ogp.me/
- Facebook OG Guide: https://developers.facebook.com/docs/sharing/webmasters
- Twitter Cards: https://developer.twitter.com/en/docs/twitter-for-websites/cards

---

## 🎉 You're Almost Done!

Once you have your OG image at `/public/og-image.png`:

1. ✅ Test it with online debuggers
2. ✅ Deploy your site
3. ✅ Share on social media to verify
4. ✅ Celebrate! 🎊

---

**Your landing page is production-ready!** 🚀

