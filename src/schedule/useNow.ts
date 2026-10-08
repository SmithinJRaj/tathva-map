import { useEffect, useState } from 'react'

/** Current time, refreshed every `intervalMs` while the page is visible and on returning to it. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: number | undefined
    const stop = () => {
      window.clearInterval(timer)
      timer = undefined
    }
    const start = () => {
      stop()
      timer = window.setInterval(() => setNow(new Date()), intervalMs)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        setNow(new Date())
        start()
      } else {
        stop()
      }
    }
    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs])
  return now
}
