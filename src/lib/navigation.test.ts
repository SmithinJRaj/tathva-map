import { describe, expect, it } from 'vitest'
import { bearing, distance, locateOnPath, projectOnSegment, turnAngle } from './geo'
import { buildSteps, navigate, offRouteThreshold } from './navigation'

// A tiny grid near the campus. At this latitude a ten-thousandth of a degree of latitude is
// about 11 m, which keeps the expected numbers easy to reason about.
const O = { lat: 11.3215, lng: 75.9342 }
const north = (m: number) => ({ lat: O.lat + m / 110_574, lng: O.lng })
const east = (m: number) => ({ lat: O.lat, lng: O.lng + m / (111_320 * Math.cos((O.lat * Math.PI) / 180)) })
const at = (e: number, n: number) => ({
  lat: O.lat + n / 110_574,
  lng: O.lng + e / (111_320 * Math.cos((O.lat * Math.PI) / 180)),
})

describe('geo', () => {
  it('measures distance in metres', () => {
    expect(distance(O, north(100))).toBeCloseTo(100, 1)
    expect(distance(O, east(100))).toBeCloseTo(100, 1)
  })

  it('reports bearings clockwise from north', () => {
    expect(bearing(O, north(50))).toBeCloseTo(0, 1)
    expect(bearing(O, east(50))).toBeCloseTo(90, 1)
    expect(bearing(O, north(-50))).toBeCloseTo(180, 1)
    expect(bearing(O, east(-50))).toBeCloseTo(270, 1)
  })

  it('signs turns left-negative, right-positive, and wraps', () => {
    expect(turnAngle(0, 90)).toBe(90)
    expect(turnAngle(0, 270)).toBe(-90)
    expect(turnAngle(350, 10)).toBe(20)
    expect(turnAngle(10, 350)).toBe(-20)
  })

  it('projects onto a segment and clamps to its ends', () => {
    const a = O
    const b = east(100)
    const middle = projectOnSegment(at(50, 20), a, b)
    expect(middle.t).toBeCloseTo(0.5, 2)
    expect(middle.distance).toBeCloseTo(20, 0)

    expect(projectOnSegment(at(-40, 0), a, b).t).toBe(0)
    expect(projectOnSegment(at(400, 0), a, b).t).toBe(1)
  })

  it('handles a zero-length segment without dividing by zero', () => {
    const projection = projectOnSegment(east(10), O, O)
    expect(projection.t).toBe(0)
    expect(projection.distance).toBeCloseTo(10, 1)
  })
})

describe('locateOnPath', () => {
  const path = [O, east(100), at(100, 100)]

  it('measures travelled and remaining along the path', () => {
    const half = locateOnPath(path, at(50, 0))!
    expect(half.segment).toBe(0)
    expect(half.travelled).toBeCloseTo(50, 0)
    expect(half.remaining).toBeCloseTo(150, 0)
  })

  it('picks the nearest segment, not the first plausible one', () => {
    const nearSecond = locateOnPath(path, at(105, 60))!
    expect(nearSecond.segment).toBe(1)
    expect(nearSecond.offPath).toBeCloseTo(5, 0)
  })

  it('returns null for a degenerate path', () => {
    expect(locateOnPath([O], O)).toBeNull()
  })
})

describe('buildSteps', () => {
  it('opens with a start and closes with an arrival', () => {
    const steps = buildSteps([O, east(100)])
    expect(steps.map((s) => s.manoeuvre)).toEqual(['start', 'arrive'])
    expect(steps[0].length).toBeCloseTo(100, 0)
  })

  it('ignores a gentle bend but reports a real turn', () => {
    // East, then a few degrees off: not worth mentioning.
    const gentle = buildSteps([O, east(100), at(200, 8)])
    expect(gentle.map((s) => s.manoeuvre)).toEqual(['start', 'arrive'])

    // East, then due north: a left turn.
    const corner = buildSteps([O, east(100), at(100, 100)])
    expect(corner.map((s) => s.manoeuvre)).toEqual(['start', 'left', 'arrive'])
    expect(corner[1].distanceFromStart).toBeCloseTo(100, 0)
  })

  it('distinguishes slight, normal and sharp turns, and sides', () => {
    const slightRight = buildSteps([O, north(100), at(40, 160)])
    expect(slightRight[1].manoeuvre).toBe('slight-right')

    const sharpRight = buildSteps([O, north(100), at(60, 60)])
    expect(sharpRight[1].manoeuvre).toBe('sharp-right')

    const left = buildSteps([O, north(100), at(-80, 160)])
    expect(left[1].manoeuvre).toBe('left')
  })

  it('gives each step the distance to the next one', () => {
    const steps = buildSteps([O, east(100), at(100, 100)])
    expect(steps[0].length).toBeCloseTo(100, 0)
    expect(steps[1].length).toBeCloseTo(100, 0)
  })
})

describe('navigate', () => {
  const path = [O, east(100), at(100, 100)]
  const steps = buildSteps(path)

  it('counts down to the next manoeuvre', () => {
    const state = navigate(path, steps, at(40, 0), 8)!
    expect(state.step.manoeuvre).toBe('left')
    expect(state.distanceToStep).toBeCloseTo(60, 0)
    expect(state.remaining).toBeCloseTo(160, 0)
    expect(state.offRoute).toBe(false)
    expect(state.arrived).toBe(false)
  })

  it('moves on to the arrival once the turn is behind', () => {
    const state = navigate(path, steps, at(100, 50), 8)!
    expect(state.step.manoeuvre).toBe('arrive')
    expect(state.distanceToStep).toBeCloseTo(50, 0)
  })

  it('reports arrival near the end', () => {
    expect(navigate(path, steps, at(100, 95), 8)!.arrived).toBe(true)
  })

  it('flags off-route only past the threshold', () => {
    expect(navigate(path, steps, at(50, 20), 8)!.offRoute).toBe(false)
    expect(navigate(path, steps, at(50, 70), 8)!.offRoute).toBe(true)
  })

  it('widens the off-route threshold when the fix is poor', () => {
    expect(offRouteThreshold(null)).toBe(30)
    expect(offRouteThreshold(5)).toBe(30)
    expect(offRouteThreshold(40)).toBe(60)
    // However bad the device says the fix is, the threshold stays usable.
    expect(offRouteThreshold(1000)).toBe(80)
  })

  it('tolerates a poor fix that would otherwise look off-route', () => {
    expect(navigate(path, steps, at(50, 50), 45)!.offRoute).toBe(false)
  })
})

describe('buildSteps: merging close manoeuvres', () => {
  it('cancels a jink out rather than calling it two turns', () => {
    // Five metres left, then straight back right: a kerb, not a pair of turns.
    const jink = buildSteps([O, east(60), at(65, 5), at(130, 5), at(200, 5)])
    expect(jink.map((s) => s.manoeuvre)).toEqual(['start', 'arrive'])
  })

  it('composes two quick turns the same way into one sharper turn', () => {
    // Two 45-degree lefts within a few metres make one 90-degree left.
    const steps = buildSteps([O, east(80), at(88, 8), at(88, 80)])
    const turns = steps.filter((s) => s.manoeuvre !== 'start' && s.manoeuvre !== 'arrive')
    expect(turns).toHaveLength(1)
    expect(turns[0].manoeuvre).toBe('left')
  })

  it('still reports turns that are genuinely far apart', () => {
    const steps = buildSteps([O, east(100), at(100, 100), at(200, 100)])
    expect(steps.map((s) => s.manoeuvre)).toEqual(['start', 'left', 'right', 'arrive'])
  })
})
