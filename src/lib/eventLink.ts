export const EVENT_PARAM = 'event'

/** The event a shared link points at, if the page was opened from one. */
export function readEventIdFromUrl(search: string = window.location.search): string | null {
  return new URLSearchParams(search).get(EVENT_PARAM) || null
}

/** A link to one event, at the site root so it never carries the sharer's own QR location. */
export function eventShareUrl(id: string, href: string = window.location.href): string {
  const url = new URL('/', href)
  url.searchParams.set(EVENT_PARAM, id)
  return url.toString()
}

/** The same address with the event dropped, so a reload doesn't fly back to it. */
export function withoutEventParam(href: string = window.location.href): string {
  const url = new URL(href)
  url.searchParams.delete(EVENT_PARAM)
  return url.toString()
}
