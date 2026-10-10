import { expect, test } from 'vitest'
import { imagePoint, imagePointOf } from '../config/mapConfig'
import { placesById } from '../data/campus'
import { emblems } from '../data/emblems'
import { emblemBounds } from './emblemBounds'

const square = [
  imagePoint(1000, 1000),
  imagePoint(1400, 1000),
  imagePoint(1400, 1400),
  imagePoint(1000, 1400),
]

const emblem = { src: 'x', aspect: 0.5, fill: 0.5, label: 'test' }

/** Back to the art's pixels, where the rectangle was worked out and the maths is checkable. */
const inPixels = (bounds: ReturnType<typeof emblemBounds>) => {
  const [[aLat, aLng], [bLat, bLng]] = bounds as [[number, number], [number, number]]
  const [x0, y0] = imagePointOf({ lat: aLat, lng: aLng })
  const [x1, y1] = imagePointOf({ lat: bLat, lng: bLng })
  return { x0, y0, x1, y1, width: x1 - x0, height: y1 - y0 }
}

test('the mark is centred on the footprint', () => {
  const r = inPixels(emblemBounds(square, emblem))
  expect((r.x0 + r.x1) / 2).toBeCloseTo(1200, 4)
  expect((r.y0 + r.y1) / 2).toBeCloseTo(1200, 4)
})

test("the rectangle keeps the file's shape rather than filling the box", () => {
  const r = inPixels(emblemBounds(square, emblem))
  expect(r.width / r.height).toBeCloseTo(emblem.aspect, 3)
})

test('a tall mark is limited by the width, a wide one by the height', () => {
  // 400x400 box. A 0.5-aspect mark at fill 1 is capped by width; a 2.0 one by height.
  const tall = inPixels(emblemBounds(square, { ...emblem, aspect: 0.5, fill: 1 }))
  expect(tall.width).toBeCloseTo(200, 3)
  expect(tall.height).toBeCloseTo(400, 3)
  const wide = inPixels(emblemBounds(square, { ...emblem, aspect: 2, fill: 1 }))
  expect(wide.width).toBeCloseTo(400, 3)
  expect(wide.height).toBeCloseTo(200, 3)
})

test('fill shrinks it without moving it or changing its shape', () => {
  const full = inPixels(emblemBounds(square, { ...emblem, fill: 1 }))
  const half = inPixels(emblemBounds(square, { ...emblem, fill: 0.5 }))
  expect(half.width).toBeCloseTo(full.width / 2, 3)
  expect(half.width / half.height).toBeCloseTo(full.width / full.height, 4)
  expect((half.x0 + half.x1) / 2).toBeCloseTo((full.x0 + full.x1) / 2, 4)
})

test('an L-shaped footprint still gets its mark in the middle of the box', () => {
  const ell = [
    imagePoint(1000, 1000), imagePoint(1400, 1000), imagePoint(1400, 1200),
    imagePoint(1200, 1200), imagePoint(1200, 1400), imagePoint(1000, 1400),
  ]
  const r = inPixels(emblemBounds(ell, emblem))
  expect((r.x0 + r.x1) / 2).toBeCloseTo(1200, 4)
})

test('every emblem names a place that exists and has an outline to sit on', () => {
  for (const [placeId, e] of Object.entries(emblems)) {
    const place = placesById.get(placeId)
    expect(place, placeId).toBeDefined()
    expect(place!.polygon, placeId).toBeTruthy()
    expect(e.aspect).toBeGreaterThan(0)
    expect(e.fill).toBeGreaterThan(0)
    expect(e.fill).toBeLessThanOrEqual(1)
  }
})

test('the mark stays inside the building it is drawn on', () => {
  for (const [placeId, e] of Object.entries(emblems)) {
    const polygon = placesById.get(placeId)!.polygon!
    const pixels = polygon.map(([lat, lng]) => imagePointOf({ lat, lng }))
    const r = inPixels(emblemBounds(polygon, e))
    expect(r.x0, placeId).toBeGreaterThanOrEqual(Math.min(...pixels.map(([x]) => x)) - 0.001)
    expect(r.x1, placeId).toBeLessThanOrEqual(Math.max(...pixels.map(([x]) => x)) + 0.001)
    expect(r.y0, placeId).toBeGreaterThanOrEqual(Math.min(...pixels.map(([, y]) => y)) - 0.001)
    expect(r.y1, placeId).toBeLessThanOrEqual(Math.max(...pixels.map(([, y]) => y)) + 0.001)
  }
})
