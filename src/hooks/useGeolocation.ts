import { useCallback, useEffect, useRef, useState } from 'react'

export interface Fix {
  lat: number
  lng: number
  /** Radius of the device's own 68% confidence circle, in metres. */
  accuracy: number
  /** Direction of travel in degrees, when the device is moving and reports one. */
  heading: number | null
  timestamp: number
}

export type LocationStatus =
  | 'unsupported'
  /** Available, not yet asked for. */
  | 'idle'
  /** Asked, waiting for the first fix (or for the user to answer the prompt). */
  | 'locating'
  | 'watching'
  | 'denied'
  | 'error'

export interface Geolocation {
  fix: Fix | null
  status: LocationStatus
  message: string | null
  start: () => void
  stop: () => void
}

const OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  // A campus walk needs a current fix, not a cached one from the last building.
  maximumAge: 5_000,
  timeout: 20_000,
}

/**
 * Browsers only hand over a location on an explicit user gesture the first time, and only on
 * a secure origin. So "by default" means: if permission was granted on a previous visit, the
 * Permissions API lets us start watching on load without a prompt; otherwise we wait to be
 * asked. Requesting unprompted on first load is what gets a site permanently blocked.
 */
export function useGeolocation(): Geolocation {
  const [fix, setFix] = useState<Fix | null>(null)
  const [status, setStatus] = useState<LocationStatus>(() =>
    'geolocation' in navigator ? 'idle' : 'unsupported',
  )
  const [message, setMessage] = useState<string | null>(null)
  const watchRef = useRef<number | null>(null)

  const stop = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current)
      watchRef.current = null
    }
    setStatus((s) => (s === 'unsupported' ? s : 'idle'))
  }, [])

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unsupported')
      return
    }
    // getCurrentPosition fails on an insecure origin with a confusing message; say it plainly.
    if (!window.isSecureContext) {
      setStatus('error')
      setMessage('Location needs a secure (https) connection')
      return
    }
    if (watchRef.current !== null) return

    setStatus('locating')
    setMessage(null)
    watchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy, heading } = position.coords
        setFix({
          lat: latitude,
          lng: longitude,
          accuracy: accuracy ?? 0,
          // Only a moving device reports a heading; stationary it is NaN or null.
          heading: heading !== null && Number.isFinite(heading) ? heading : null,
          timestamp: position.timestamp,
        })
        setStatus('watching')
        setMessage(null)
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setStatus('denied')
          setMessage('Location permission denied')
        } else if (error.code === error.TIMEOUT) {
          // A timeout is not fatal: the watch keeps trying, so stay in locating.
          setMessage('Still looking for a signal…')
        } else {
          setStatus('error')
          setMessage('Location unavailable')
        }
      },
      OPTIONS,
    )
  }, [])

  // Resume without a prompt when permission is already granted from a previous visit.
  useEffect(() => {
    let cancelled = false
    if (!('permissions' in navigator) || !('geolocation' in navigator)) return
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((permission) => {
        if (cancelled) return
        if (permission.state === 'granted') start()
        if (permission.state === 'denied') setStatus('denied')
      })
      // Firefox once rejected this query for geolocation; not having it is harmless.
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [start])

  useEffect(
    () => () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current)
    },
    [],
  )

  return { fix, status, message, start, stop }
}
