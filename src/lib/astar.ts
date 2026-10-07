// Pure A* shortest-path over a lat/lng graph. No React, no Leaflet.

import { allowsMode, type GraphNode, type RoutingGraph, type TravelMode } from './graph'

const EARTH_RADIUS_M = 6_371_000
const toRad = (deg: number) => (deg * Math.PI) / 180

/** Great-circle distance in metres. Ignores floor, so it never overestimates stair edges. */
export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

export interface RouteResult {
  path: GraphNode[]
  /** Total cost in metres (sum of edge distances). */
  distance: number
}

type Adjacency = Map<string, { to: string; distance: number }[]>

/**
 * Edges are bidirectional: campus one-ways are not worth modelling for either mode.
 * `mode` decides which edges exist at all — a driver never gets a footpath or a staircase.
 */
export function buildAdjacency(graph: RoutingGraph, mode: TravelMode): Adjacency {
  const adj: Adjacency = new Map(graph.nodes.map((n) => [n.id, []]))
  for (const edge of graph.edges) {
    if (!allowsMode(edge, mode)) continue
    adj.get(edge.from)?.push({ to: edge.to, distance: edge.distance })
    adj.get(edge.to)?.push({ to: edge.from, distance: edge.distance })
  }
  return adj
}

/** Minimal binary min-heap keyed on f-score. */
class MinHeap {
  private items: { id: string; f: number }[] = []

  get size() {
    return this.items.length
  }

  push(id: string, f: number) {
    const items = this.items
    items.push({ id, f })
    let i = items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (items[parent].f <= items[i].f) break
      ;[items[parent], items[i]] = [items[i], items[parent]]
      i = parent
    }
  }

  pop(): string | undefined {
    const items = this.items
    if (items.length === 0) return undefined
    const top = items[0]
    const last = items.pop()!
    if (items.length > 0) {
      items[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let smallest = i
        if (l < items.length && items[l].f < items[smallest].f) smallest = l
        if (r < items.length && items[r].f < items[smallest].f) smallest = r
        if (smallest === i) break
        ;[items[smallest], items[i]] = [items[i], items[smallest]]
        i = smallest
      }
    }
    return top.id
  }
}

export function findRoute(
  graph: RoutingGraph,
  startId: string,
  goalId: string,
  adjacency: Adjacency,
): RouteResult | null {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]))
  const start = nodes.get(startId)
  const goal = nodes.get(goalId)
  if (!start || !goal) return null

  const gScore = new Map<string, number>([[startId, 0]])
  const cameFrom = new Map<string, string>()
  const closed = new Set<string>()
  const open = new MinHeap()
  open.push(startId, haversine(start, goal))

  while (open.size > 0) {
    const current = open.pop()!
    if (closed.has(current)) continue // stale heap entry (lazy deletion)

    if (current === goalId) {
      const path: GraphNode[] = [goal]
      let id = goalId
      while (cameFrom.has(id)) {
        id = cameFrom.get(id)!
        path.push(nodes.get(id)!)
      }
      return { path: path.reverse(), distance: gScore.get(goalId)! }
    }

    closed.add(current)
    const g = gScore.get(current)!

    for (const { to, distance } of adjacency.get(current) ?? []) {
      if (closed.has(to)) continue
      const tentative = g + distance
      if (tentative < (gScore.get(to) ?? Infinity)) {
        cameFrom.set(to, current)
        gScore.set(to, tentative)
        open.push(to, tentative + haversine(nodes.get(to)!, goal))
      }
    }
  }

  return null
}
