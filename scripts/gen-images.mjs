/**
 * Generate og-image.png (1200x630) and apple-touch-icon.png (180x180)
 * from embedded SVG using the Canvas API via the `canvas` npm package.
 *
 * Run: node scripts/gen-images.mjs
 *
 * These are static brand images. Regenerate when the logo or brand colors change.
 */

import { createCanvas } from 'canvas'
import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC = resolve(__dirname, '../public')
mkdirSync(PUBLIC, { recursive: true })

// Brand tokens (must match index.css CSS vars)
const INK = '#0a0f1e'
const ROPE = '#2d5be3'
const PAPER = '#f8f6f2'
const WHITE = '#ffffff'

// Draw the "L" logomark as a tight geometric shape
function drawLogoMark(ctx, cx, cy, size) {
  const s = size
  ctx.save()
  ctx.translate(cx - s / 2, cy - s / 2)

  // Outer square with rounded corners
  const r = s * 0.14
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.lineTo(s - r, 0)
  ctx.quadraticCurveTo(s, 0, s, r)
  ctx.lineTo(s, s - r)
  ctx.quadraticCurveTo(s, s, s - r, s)
  ctx.lineTo(r, s)
  ctx.quadraticCurveTo(0, s, 0, s - r)
  ctx.lineTo(0, r)
  ctx.quadraticCurveTo(0, 0, r, 0)
  ctx.closePath()
  ctx.fillStyle = ROPE
  ctx.fill()

  // "L" letter in white
  const lw = s * 0.15   // stroke width
  const pad = s * 0.25  // padding inside
  ctx.fillStyle = WHITE
  // Vertical bar
  ctx.fillRect(pad, pad, lw, s - pad * 2)
  // Horizontal bar
  ctx.fillRect(pad, s - pad - lw, s - pad * 1.5, lw)

  ctx.restore()
}

function drawText(ctx, text, x, y, size, weight, color, align = 'left') {
  ctx.save()
  ctx.fillStyle = color
  ctx.font = `${weight} ${size}px system-ui, -apple-system, sans-serif`
  ctx.textAlign = align
  ctx.fillText(text, x, y)
  ctx.restore()
}

// OG image: 1200x630
{
  const W = 1200, H = 630
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, W, H)

  // Left ink band
  ctx.fillStyle = INK
  ctx.fillRect(0, 0, 320, H)

  // Logo mark on ink band
  drawLogoMark(ctx, 160, 200, 96)

  // "Leash" wordmark on ink band
  drawText(ctx, 'Leash', 160, 320, 52, '700', WHITE, 'center')

  // Tagline on ink band
  drawText(ctx, 'USDC spending policy', 160, 360, 18, '400', '#8e97b0', 'center')
  drawText(ctx, 'vault for AI agents', 160, 385, 18, '400', '#8e97b0', 'center')

  // Right side content
  const rx = 380, ry = 120
  drawText(ctx, 'Give agents USDC.', rx, ry, 52, '700', INK)
  drawText(ctx, 'Keep control.', rx, ry + 68, 52, '700', ROPE)

  const lines = [
    'Set per-payment and daily caps.',
    'Review held payments before release.',
    'Freeze spending instantly.',
    'Withdraw anytime, no delay.',
  ]
  lines.forEach((line, i) => {
    // Bullet dot
    ctx.beginPath()
    ctx.arc(rx + 8, ry + 165 + i * 42, 4, 0, Math.PI * 2)
    ctx.fillStyle = ROPE
    ctx.fill()
    drawText(ctx, line, rx + 24, ry + 171 + i * 42, 20, '400', '#2a3350')
  })

  // Arc testnet badge
  const bx = rx, by = H - 90
  ctx.strokeStyle = ROPE
  ctx.lineWidth = 1.5
  const bw = 150, bh = 34
  ctx.strokeRect(bx, by, bw, bh)
  drawText(ctx, 'Arc Testnet', bx + bw / 2, by + 22, 14, '600', ROPE, 'center')

  // Unaudited notice
  drawText(ctx, 'Unaudited. Start with small amounts.', rx, H - 40, 13, '400', '#8e97b0')

  writeFileSync(resolve(PUBLIC, 'og-image.png'), canvas.toBuffer('image/png'))
  console.log('Wrote public/og-image.png')
}

// Apple touch icon: 180x180
{
  const S = 180
  const canvas = createCanvas(S, S)
  const ctx = canvas.getContext('2d')

  // Rounded background (simulate border-radius with a path)
  const r = 36
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.lineTo(S - r, 0)
  ctx.quadraticCurveTo(S, 0, S, r)
  ctx.lineTo(S, S - r)
  ctx.quadraticCurveTo(S, S, S - r, S)
  ctx.lineTo(r, S)
  ctx.quadraticCurveTo(0, S, 0, S - r)
  ctx.lineTo(0, r)
  ctx.quadraticCurveTo(0, 0, r, 0)
  ctx.closePath()
  ctx.fillStyle = INK
  ctx.fill()

  // Logo mark centered
  drawLogoMark(ctx, S / 2, S / 2, 100)

  writeFileSync(resolve(PUBLIC, 'apple-touch-icon.png'), canvas.toBuffer('image/png'))
  console.log('Wrote public/apple-touch-icon.png')
}
