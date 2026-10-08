import { formatIstTime } from '../../shared/ist.ts'
import { knownPlaces } from '../../shared/places.ts'
import type { ScheduleEvent } from '../../shared/schedule.ts'
import { eventShareUrl } from './eventLink'

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed'

/**
 * The phone's own share sheet where there is one (it reaches WhatsApp directly); otherwise the
 * link goes on the clipboard. Dismissing the share sheet is not a failure.
 */
export async function shareEvent(event: ScheduleEvent): Promise<ShareOutcome> {
  const url = eventShareUrl(event.id)
  const venue = knownPlaces.get(event.placeId) ?? 'Tathva'
  const text = `${event.title} · ${formatIstTime(event.startAt)} at ${venue}`
  if (navigator.share) {
    try {
      await navigator.share({ title: event.title, text, url })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
    }
  }
  const message = `${text}\n${url}`
  try {
    await navigator.clipboard.writeText(message)
    return 'copied'
  } catch {
    return legacyCopy(message) ? 'copied' : 'failed'
  }
}

/** For browsers that refuse the async clipboard (embedded views, older WebViews). */
function legacyCopy(value: string): boolean {
  const area = document.createElement('textarea')
  area.value = value
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.append(area)
  area.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}
