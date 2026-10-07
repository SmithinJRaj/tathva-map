import { imagePoint } from '../config/mapConfig'
import generated from '../data/generated/campus.json'
import { indoorPlaces } from '../data/festContent'

/** How an edge may be travelled. `foot` is a path or steps; `road` carries traffic too. */
export type EdgeMode = 'foot' | 'road'

export type TravelMode = 'walk' | 'drive'

export interface GraphNode {
  id: string
  lat: number
  lng: number
}

export interface GraphEdge {
  from: string
  to: string
  /** Metres. Must be >= the Haversine distance between endpoints to keep A* optimal. */
  distance: number
  mode: EdgeMode
}

export interface RoutingGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

const nodes: GraphNode[] = generated.graph.nodes.map((n) => {
  const [lat, lng] = imagePoint(n.at[0], n.at[1])
  return { id: n.id, lat, lng }
})

const nodeIndex = new Map(nodes.map((n) => [n.id, n]))

const edges: GraphEdge[] = generated.graph.edges.map((e) => ({
  from: e.from,
  to: e.to,
  distance: e.metres,
  mode: e.mode as EdgeMode,
}))

// Indoor rooms hang off their building's nearest junction: a node in the same spot, joined
// by a foot-only link whose cost stands in for the climb. Driving there is therefore
// impossible, which is the point — lib/route.ts routes drivers to the entrance instead.
for (const room of indoorPlaces) {
  const host = generated.places.find((p) => p.id === room.inside)
  const anchor = host?.nodeId ? nodeIndex.get(host.nodeId) : undefined
  if (!anchor) continue
  nodes.push({ id: room.id, lat: anchor.lat, lng: anchor.lng })
  edges.push({ from: anchor.id, to: room.id, distance: room.climbMetres, mode: 'foot' })
}

export const graph: RoutingGraph = { nodes, edges }
export const nodesById: ReadonlyMap<string, GraphNode> = new Map(nodes.map((n) => [n.id, n]))

/** Walkers use every edge; drivers only the ones that carry traffic. */
export const allowsMode = (edge: GraphEdge, mode: TravelMode) =>
  mode === 'walk' || edge.mode === 'road'
