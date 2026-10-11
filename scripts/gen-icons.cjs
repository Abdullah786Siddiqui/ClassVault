/**
 * Generates PNG icons from the SVG icon using Node.js Canvas API.
 * Run with: node scripts/gen-icons.js
 */
const fs = require('fs')
const path = require('path')
const { createCanvas } = require('canvas')

const publicDir = path.join(__dirname, '..', 'public')

function drawIcon(canvas) {
  const ctx = canvas.getContext('2d')
  const size = canvas.width

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, size, size)
  grad.addColorStop(0, '#4f46e5')
  grad.addColorStop(1, '#0ea5e9')

  // Rounded rectangle background
  const radius = size * 0.2
  ctx.beginPath()
  ctx.moveTo(radius, 0)
  ctx.lineTo(size - radius, 0)
  ctx.quadraticCurveTo(size, 0, size, radius)
  ctx.lineTo(size, size - radius)
  ctx.quadraticCurveTo(size, size, size - radius, size)
  ctx.lineTo(radius, size)
  ctx.quadraticCurveTo(0, size, 0, size - radius)
  ctx.lineTo(0, radius)
  ctx.quadraticCurveTo(0, 0, radius, 0)
  ctx.closePath()
  ctx.fillStyle = grad
  ctx.fill()

  // Scale factor
  const s = size / 256

  // Chat bubble shadow shape (white semi-transparent)
  ctx.globalAlpha = 0.12
  ctx.beginPath()
  ctx.moveTo(76 * s, 70 * s)
  ctx.lineTo(180 * s, 70 * s)
  ctx.arcTo(198 * s, 70 * s, 198 * s, 88 * s, 18 * s)
  ctx.lineTo(198 * s, 168 * s)
  ctx.arcTo(198 * s, 186 * s, 180 * s, 186 * s, 18 * s)
  ctx.lineTo(103 * s, 186 * s)
  ctx.lineTo(76 * s, 218 * s)
  ctx.lineTo(76 * s, 88 * s)
  ctx.arcTo(76 * s, 70 * s, 94 * s, 70 * s, 18 * s)
  ctx.closePath()
  ctx.fillStyle = 'white'
  ctx.fill()
  ctx.globalAlpha = 1

  // Chat bubble white background
  ctx.beginPath()
  ctx.moveTo(76 * s, 80 * s)
  ctx.lineTo(180 * s, 80 * s)
  ctx.arcTo(194 * s, 80 * s, 194 * s, 94 * s, 14 * s)
  ctx.lineTo(194 * s, 166 * s)
  ctx.arcTo(194 * s, 180 * s, 180 * s, 180 * s, 14 * s)
  ctx.lineTo(106 * s, 180 * s)
  ctx.lineTo(80 * s, 200 * s)
  ctx.lineTo(80 * s, 94 * s)
  ctx.arcTo(80 * s, 80 * s, 94 * s, 80 * s, 14 * s)
  ctx.closePath()
  ctx.fillStyle = '#f8fafc'
  ctx.fill()

  // Horizontal lines (text representation)
  ctx.strokeStyle = '#4f46e5'
  ctx.lineWidth = 12 * s
  ctx.lineCap = 'round'

  ctx.beginPath()
  ctx.moveTo(95 * s, 123 * s)
  ctx.lineTo(161 * s, 123 * s)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(95 * s, 145 * s)
  ctx.lineTo(142 * s, 145 * s)
  ctx.stroke()

  // Top dot / bullet
  ctx.beginPath()
  ctx.arc(95 * s, 108 * s, 9 * s, 0, Math.PI * 2)
  ctx.fillStyle = '#4f46e5'
  ctx.fill()
}

const sizes = [
  { name: 'pwa-192x192.png', size: 192 },
  { name: 'pwa-512x512.png', size: 512 },
  { name: 'maskable-icon-512x512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
]

let hasCanvas = true
try {
  require.resolve('canvas')
} catch (e) {
  hasCanvas = false
}

if (!hasCanvas) {
  console.log(
    '[gen-icons] "canvas" package not found. Run: npm install --save-dev canvas\nThen re-run this script.'
  )
  process.exit(0)
}

for (const { name, size } of sizes) {
  const canvas = createCanvas(size, size)
  drawIcon(canvas)
  const buffer = canvas.toBuffer('image/png')
  const filePath = path.join(publicDir, name)
  fs.writeFileSync(filePath, buffer)
  console.log(`[gen-icons] Generated ${filePath} (${size}x${size})`)
}

console.log('[gen-icons] Done. Icons written to public/')
