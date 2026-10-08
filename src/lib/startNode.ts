import { placesById } from '../data/campus'

export const START_NODE_PARAM = 'startNode'

// There is no in-app scanner any more, but the parameter stays: it is how a shared link, or
// a printed code opened by the phone's own camera, arrives pointing at a place. Its value is
// a place id (a slug of the place's name), which survives a data rebuild.

/** Reads ?startNode=<id> from the current URL; returns it only if it names a real place. */
export function readStartNodeFromUrl(): string | null {
  const id = new URLSearchParams(window.location.search).get(START_NODE_PARAM)
  return id && placesById.has(id) ? id : null
}
