#!/usr/bin/env node

/**
 * CityPulse AI - OG Image Generator
 * Generates a 1200x630px Open Graph image for social media previews
 * 
 * Requirements: Node.js with canvas support
 * Install: npm install canvas
 * Run: node scripts/generate-og-image.js
 */

const fs = require('fs');
const path = require('path');

// Check if canvas is available
let canvas, createCanvas, loadImage, registerFont;
try {
  ({ createCanvas, loadImage, registerFont } = require('canvas'));
  console.log('✓ Canvas library loaded');
} catch (err) {
  console.error('✗ Canvas library not found. Installing...');
  console.error('  Run: npm install canvas');
  console.error('  Then run this script again.');
  process.exit(1);
}

// Image dimensions (Open Graph standard)
const WIDTH = 1200;
const HEIGHT = 630;

// Create canvas
const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext('2d');

// Colors
const BLACK = '#000000';
const WHITE = '#ffffff';
const WHITE_60 = 'rgba(255, 255, 255, 0.6)';
const WHITE_40 = 'rgba(255, 255, 255, 0.4)';

console.log('🎨 Generating OG image...');

// Background
ctx.fillStyle = BLACK;
ctx.fillRect(0, 0, WIDTH, HEIGHT);

// Add subtle grid pattern
ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
ctx.lineWidth = 1;
for (let i = 0; i < WIDTH; i += 40) {
  ctx.beginPath();
  ctx.moveTo(i, 0);
  ctx.lineTo(i, HEIGHT);
  ctx.stroke();
}
for (let i = 0; i < HEIGHT; i += 40) {
  ctx.beginPath();
  ctx.moveTo(0, i);
  ctx.lineTo(WIDTH, i);
  ctx.stroke();
}

// Main title - "CityPulse AI"
ctx.fillStyle = WHITE;
ctx.font = 'bold 100px sans-serif';
ctx.textAlign = 'left';
ctx.fillText('CityPulse AI', 80, 180);

// Tagline
ctx.fillStyle = WHITE_60;
ctx.font = '500 42px sans-serif';
ctx.fillText('Unified Intelligence for', 80, 260);
ctx.fillText('Sustainable Cities', 80, 320);

// Stats section
const stats = [
  { value: '6', label: 'City Modules' },
  { value: '12B', label: 'Parameters' },
  { value: '3', label: 'AI Modes' },
];

let statsX = 80;
const statsY = 450;

ctx.font = 'bold 56px sans-serif';
ctx.fillStyle = WHITE;

stats.forEach((stat, idx) => {
  // Value
  ctx.fillText(stat.value, statsX, statsY);
  
  // Label
  ctx.fillStyle = WHITE_40;
  ctx.font = '400 24px sans-serif';
  ctx.fillText(stat.label, statsX, statsY + 40);
  
  // Reset for next stat
  ctx.font = 'bold 56px sans-serif';
  ctx.fillStyle = WHITE;
  
  // Move X position for next stat
  statsX += 240;
});

// Powered by badge
ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
ctx.fillRect(80, 540, 300, 50);
ctx.fillStyle = WHITE_60;
ctx.font = '400 20px sans-serif';
ctx.textAlign = 'left';
ctx.fillText('Powered by Google Gemma 4', 100, 572);

// Bottom right accent
ctx.fillStyle = WHITE;
ctx.font = 'bold 180px sans-serif';
ctx.textAlign = 'right';
ctx.globalAlpha = 0.04;
ctx.fillText('AI', WIDTH - 60, HEIGHT - 60);
ctx.globalAlpha = 1.0;

// Border
ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
ctx.lineWidth = 2;
ctx.strokeRect(20, 20, WIDTH - 40, HEIGHT - 40);

// Save to file
const outputPath = path.join(__dirname, '..', 'public', 'og-image.png');
const buffer = canvas.toBuffer('image/png');

fs.writeFileSync(outputPath, buffer);

console.log('✅ OG image generated successfully!');
console.log(`📁 Saved to: ${outputPath}`);
console.log(`📐 Dimensions: ${WIDTH}x${HEIGHT}px`);
console.log(`💾 Size: ${(buffer.length / 1024).toFixed(2)} KB`);
console.log('');
console.log('Next steps:');
console.log('  1. View the image at public/og-image.png');
console.log('  2. Test social preview at https://www.opengraph.xyz/');
console.log('  3. Deploy your site!');
console.log('');

process.exit(0);
