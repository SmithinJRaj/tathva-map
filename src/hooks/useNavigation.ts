import { useMemo, useState } from 'react'
import type { RouteResult } from '../lib/astar'
import type { LatLng } from '../lib/geo'
import { buildSteps, navigate, type NavState } from '../lib/navigation'
import type { Fix } from './useGeolocation'

/**
 * A fix has to look off-route this many times running before we say so. A single bad
 * reading — a reflection off a building, a moment of poor sky — is normal, and announcing a
 * detour for one of them would make the panel flap.
 */
const OFF_ROUTE_STRIKES = 3

export interface Navigation {
  state: NavState | null
  /** True once the fix has been off the line long enough to mean it. */
  recalculating: boolean
}

/** Follows a live fix along a computed route, and says what to do next. */
export function useNavigation(route: RouteResult | null, fix: Fix | null, active: boolean): Navigation {
  const path = useMemo<LatLng[]>(
    () => (route ? route.path.map((n) => ({ lat: n.lat, lng: n.lng })) : []),
    [route],
  )
  const steps = useMemo(() => buildSteps(path), [path])

  const state = useMemo(
    () => (active && fix && path.length >= 2 ? navigate(path, steps, fix, fix.accuracy) : null),
    [active, fix, path, steps],
  )

  // Count consecutive off-route fixes rather than reacting to one. Adjusted during render
  // against the fix's own timestamp, which is React's pattern for state derived from a
  // changing input: an effect here would commit a render and then immediately queue another.
  const [streak, setStreak] = useState({ count: 0, at: 0 })
  const timestamp = fix?.timestamp ?? 0
  if (streak.at !== timestamp) {
    setStreak({ count: state?.offRoute ? streak.count + 1 : 0, at: timestamp })
  }

  return { state, recalculating: Boolean(state) && streak.count >= OFF_ROUTE_STRIKES }
}
