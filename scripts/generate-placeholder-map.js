#!/usr/bin/env node
// One-off generator for the placeholder campus art: a 1024x1024 pixel-art PNG with
// checkerboard grass, grey paths, coloured building blocks and a "PLACEHOLDER" banner.
// No dependencies: pixels are drawn into a buffer and PNG-encoded with node:zlib.
//
// Usage: node scripts/generate-placeholder-map.js
// Output: src/assets/map/nitc-placeholder.png

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const SIZE = 1024
const OUT_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'map', 'nitc-placeholder.png')

const rgb = new Uint8Array(SIZE * SIZE * 3)

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

function fillRect(x, y, w, h, color) {
  const [r, g, b] = hex(color)
  for (let yy = Math.max(0, y); yy < Math.min(SIZE, y + h); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(SIZE, x + w); xx++) {
      const i = (yy * SIZE + xx) * 3
      rgb[i] = r
      rgb[i + 1] = g
      rgb[i + 2] = b
    }
  }
}

// Grass: chunky 32px checkerboard.
const CELL = 32
for (let cy = 0; cy < SIZE / CELL; cy++) {
  for (let cx = 0; cx < SIZE / CELL; cx++) {
    fillRect(cx * CELL, cy * CELL, CELL, CELL, (cx + cy) % 2 ? '#38b764' : '#257179')
  }
}

// Paths: axis-aligned grey strips with a darker edge.
const paths = [
  [0, 560, SIZE, 32], // east-west road
  [400, 0, 32, SIZE], // north-south road
  [432, 320, 400, 24],
  [704, 344, 24, 216],
  [160, 592, 24, 300],
]
for (const [x, y, w, h] of paths) {
  fillRect(x - 4, y - 4, w + 8, h + 8, '#333c57')
  fillRect(x, y, w, h, '#94b0c2')
}

// Buildings: coloured blocks with a dark outline and a lighter roof strip.
const blocks = [
  [480, 160, 192, 128, '#b13e53'],
  [760, 180, 160, 112, '#ef7d57'],
  [480, 400, 176, 128, '#41a6f6'],
  [760, 620, 176, 160, '#5d275d'],
  [200, 660, 176, 120, '#ffcd75'],
  [96, 160, 224, 128, '#3b5dc9'],
]
for (const [x, y, w, h, color] of blocks) {
  fillRect(x - 8, y - 8, w + 16, h + 16, '#1a1c2c')
  fillRect(x, y, w, h, color)
  fillRect(x, y, w, 16, '#f4f4f4')
}

// 5x7 bitmap font, only the glyphs the banner needs. Each row is 5 bits, MSB = leftmost.
const FONT = {
  A: [14, 17, 17, 31, 17, 17, 17],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  L: [16, 16, 16, 16, 16, 16, 31],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  R: [30, 17, 17, 30, 20, 18, 17],
  T: [31, 4, 4, 4, 4, 4, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  '-': [0, 0, 0, 31, 0, 0, 0],
  ' ': [0, 0, 0, 0, 0, 0, 0],
}

function drawText(text, cx, y, scale, color) {
  const advance = 6 * scale
  let x = Math.round(cx - (text.length * advance - scale) / 2)
  for (const ch of text) {
    const rows = FONT[ch]
    if (!rows) throw new Error(`No glyph for "${ch}"`)
    rows.forEach((bits, row) => {
      for (let col = 0; col < 5; col++) {
        if (bits & (1 << (4 - col))) fillRect(x + col * scale, y + row * scale, scale, scale, color)
      }
    })
    x += advance
  }
}

// Banner across the middle, two lines so the text stays big.
fillRect(64, 832, SIZE - 128, 144, '#1a1c2c')
fillRect(72, 840, SIZE - 144, 128, '#f4f4f4')
fillRect(80, 848, SIZE - 160, 112, '#1a1c2c')
drawText('PLACEHOLDER -', SIZE / 2, 862, 5, '#ffcd75')
drawText('REPLACE WITH NITC ART', SIZE / 2, 912, 5, '#f4f4f4')

// --- PNG encoding ---------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 2 // colour type: truecolour RGB

// Each scanline is prefixed with filter byte 0 (None).
const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1))
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 3 + 1)] = 0
  Buffer.from(rgb.buffer, y * SIZE * 3, SIZE * 3).copy(raw, y * (SIZE * 3 + 1) + 1)
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

await mkdir(dirname(OUT_FILE), { recursive: true })
await writeFile(OUT_FILE, png)
console.log(`Wrote ${OUT_FILE} (${png.length} bytes)`)
