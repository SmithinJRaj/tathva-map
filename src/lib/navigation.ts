// Turns a route into directions, and tracks a live position along it.
//
// The routing graph is a dense chain of OpenStreetMap shape points, so most of its nodes are
// nothing to tell anyone about — a road that bends gently still reads as "carry on". Steps
// are therefore built by walking the path and only emitting a manoeuvre where the bearing
// changes enough to be worth saying out loud.

import { bearing, distance, locateOnPath, turnAngle, type LatLng, type PathProgress } from './geo'

export type Manoeuvre =
  | 'start'
  | 'straight'
  | 'slight-left'
  | 'left'
  | 'sharp-left'
  | 'slight-right'
  | 'right'
  | 'sharp-right'
  | 'arrive'

export interface NavStep {
  manoeuvre: Manoeuvre
  /** Index into the route path where this step begins. */
  at: number
  /** Distance from the route's start to that point, in metres. */
  distanceFromStart: number
  /** Length of this step: how far to keep going before the next manoeuvre. */
  length: number
  text: string
}

/**
 * Below this the bend is not worth mentioning; above it the step gets a turn. A campus path
 * wanders by a few degrees constantly, so a low threshold would bury the real turns.
 */
const STRAIGHT_DEGREES = 25
const SHARP_DEGREES = 110

/**
 * Turns closer together than this are treated as one manoeuvre. Mapped paths are full of
 * small jogs — a few metres left then straight back right where a way was drawn around a
 * kerb — and reporting each one gives "turn left, turn right, turn left" for what is plainly
 * a straight walk. Merging sums the angles, so a jink cancels itself out and two real turns
 * in quick succession compose into the single sharper turn a person actually makes.
 */
const MIN_TURN_SPACING_M = 20

function classify(angle: number): Manoeuvre {
  const magnitude = Math.abs(angle)
  if (magnitude < STRAIGHT_DEGREES) return 'straight'
  const side = angle < 0 ? 'left' : 'right'
  if (magnitude >= SHARP_DEGREES) return `sharp-${side}` as Manoeuvre
  if (magnitude < 50) return `slight-${side}` as Manoeuvre
  return side as Manoeuvre
}

const WORDS: Record<Manoeuvre, string> = {
  start: 'Head off',
  straight: 'Continue',
  'slight-left': 'Bear left',
  left: 'Turn left',
  'sharp-left': 'Sharp left',
  'slight-right': 'Bear right',
  right: 'Turn right',
  'sharp-right': 'Sharp right',
  arrive: 'Arrive',
}

/** Builds the direction list for a route path. */
export function buildSteps(path: readonly LatLng[]): NavStep[] {
  if (path.length < 2) return []

  const cumulative: number[] = [0]
  for (let i = 1; i < path.length; i++) {
    cumulative.push(cumulative[i - 1] + distance(path[i - 1], path[i]))
  }

  // Every bend in the geometry, however small, with its signed angle.
  const bends: { at: number; angle: number }[] = []
  for (let i = 1; i < path.length - 1; i++) {
    const incoming = bearing(path[i - 1], path[i])
    const outgoing = bearing(path[i], path[i + 1])
    bends.push({ at: i, angle: turnAngle(incoming, outgoing) })
  }

  // Combine bends that fall within MIN_TURN_SPACING_M of each other, keeping the position of
  // the sharpest one so the instruction lands on the corner a person would recognise.
  const merged: { at: number; angle: number }[] = []
  for (const bend of bends) {
    const previous = merged[merged.length - 1]
    if (previous && cumulative[bend.at] - cumulative[previous.at] < MIN_TURN_SPACING_M) {
      previous.angle += bend.angle
      if (Math.abs(bend.angle) > Math.abs(previous.angle - bend.angle)) previous.at = bend.at
      continue
    }
    merged.push({ ...bend })
  }

  const steps: NavStep[] = [
    { manoeuvre: 'start', at: 0, distanceFromStart: 0, length: 0, text: WORDS.start },
  ]

  for (const bend of merged) {
    const manoeuvre = classify(bend.angle)
    if (manoeuvre === 'straight') continue
    steps.push({
      manoeuvre,
      at: bend.at,
      distanceFromStart: cumulative[bend.at],
      length: 0,
      text: WORDS[manoeuvre],
    })
  }

  steps.push({
    manoeuvre: 'arrive',
    at: path.length - 1,
    distanceFromStart: cumulative[cumulative.length - 1],
    length: 0,
    text: WORDS.arrive,
  })

  // Each step runs until the next one starts.
  for (let i = 0; i < steps.length - 1; i++) {
    steps[i].length = steps[i + 1].distanceFromStart - steps[i].distanceFromStart
  }
  return steps
}

export interface NavState {
  progress: PathProgress
  /** The manoeuvre being approached. */
  step: NavStep
  /** Distance from the live position to that manoeuvre, in metres. */
  distanceToStep: number
  /** Metres still to travel. */
  remaining: number
  /** True once the end is close enough to call it arrived. */
  arrived: boolean
  /** True when the fix has strayed far enough to want a new route. */
  offRoute: boolean
}

/** Close enough to the destination to stop giving directions. */
export const ARRIVE_RADIUS_M = 18

/**
 * How far off the line counts as off-route. GPS on a phone is good to perhaps ten metres in
 * the open and much worse beside a building, so this has to clear honest drift; `accuracy`
 * widens it further when the device itself says the fix is poor.
 */
export function offRouteThreshold(accuracy: number | null): number {
  return Math.max(30, Math.min(80, (accuracy ?? 0) * 1.5))
}

/** Where the walker is on the route, and what to tell them next. */
export function navigate(
  path: readonly LatLng[],
  steps: readonly NavStep[],
  fix: LatLng,
  accuracy: number | null,
): NavState | null {
  const progress = locateOnPath(path, fix)
  if (!progress || steps.length === 0) return null

  // The step being approached is the first one still ahead; past the last turn that is the
  // arrival, which always exists.
  const upcoming =
    steps.find((s) => s.distanceFromStart > progress.travelled + 1) ?? steps[steps.length - 1]

  return {
    progress,
    step: upcoming,
    distanceToStep: Math.max(0, upcoming.distanceFromStart - progress.travelled),
    remaining: progress.remaining,
    arrived: progress.remaining <= ARRIVE_RADIUS_M,
    offRoute: progress.offPath > offRouteThreshold(accuracy),
  }
}
