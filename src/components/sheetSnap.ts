export type SheetSnap = 'peek' | 'half' | 'full'

export const SHEET_PEEK_PX = 56

/** Space left above a full sheet so the trip planner stays visible. */
const FULL_MARGIN_PX = 180

export function sheetHeight(snap: SheetSnap, viewportPx: number): number {
  if (snap === 'peek') return SHEET_PEEK_PX
  if (snap === 'half') return viewportPx / 2
  return viewportPx - FULL_MARGIN_PX
}

export function nearestSnap(heightPx: number, viewportPx: number): SheetSnap {
  const snaps: SheetSnap[] = ['peek', 'half', 'full']
  let best = snaps[0]
  for (const snap of snaps) {
    if (Math.abs(sheetHeight(snap, viewportPx) - heightPx) < Math.abs(sheetHeight(best, viewportPx) - heightPx)) {
      best = snap
    }
  }
  return best
}
