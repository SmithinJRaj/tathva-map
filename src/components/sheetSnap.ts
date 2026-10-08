export type SheetSnap = 'peek' | 'half' | 'full'

export const SHEET_PEEK_PX = 56

/**
 * Height of the trip planner at the top of the screen, with its route line showing. A full
 * sheet stops below it, and popups auto-pan clear of it.
 */
export const PLANNER_CLEARANCE_PX = 200

export function sheetHeight(snap: SheetSnap, viewportPx: number): number {
  if (snap === 'peek') return SHEET_PEEK_PX
  if (snap === 'half') return viewportPx / 2
  return viewportPx - PLANNER_CLEARANCE_PX
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
