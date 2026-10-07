import { placesById } from '../data/campus'

export const START_NODE_PARAM = 'startNode'

// The parameter still reads `startNode` so codes printed against the old data keep working;
// its value is now a place id (a slug of the place's name), which survives a data rebuild.

/** Reads ?startNode=<id> from the current URL; returns it only if it names a real place. */
export function readStartNodeFromUrl(): string | null {
  const id = new URLSearchParams(window.location.search).get(START_NODE_PARAM)
  return id && placesById.has(id) ? id : null
}

/**
 * Accepts either a full URL containing ?startNode=<id> (so the same QR works when
 * scanned with the phone's native camera) or a bare place id.
 */
export function parseScannedNode(text: string): string | null {
  const trimmed = text.trim()
  try {
    const id = new URL(trimmed).searchParams.get(START_NODE_PARAM)
    if (id && placesById.has(id)) return id
  } catch {
    // Not a URL; fall through to bare-id handling.
  }
  return placesById.has(trimmed) ? trimmed : null
}

/** Keeps the address bar in sync so a reload / share preserves the calibrated location. */
export function writeStartNodeToUrl(id: string) {
  const url = new URL(window.location.href)
  url.searchParams.set(START_NODE_PARAM, id)
  window.history.replaceState(null, '', url)
}
