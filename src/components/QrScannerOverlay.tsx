import { Html5Qrcode } from 'html5-qrcode'
import { useEffect, useRef, useState } from 'react'

interface Props {
  onScan: (text: string) => void
  onClose: () => void
}

/**
 * Full-screen camera overlay. The camera is started on mount and stopped in the
 * effect cleanup, so closing the overlay (or unmounting for any reason) always
 * releases the camera.
 */
export function QrScannerOverlay({ onScan, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const onScanRef = useRef(onScan)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // html5-qrcode needs an element id, and clear() wipes that element's children.
    // A fresh child per mount keeps StrictMode's mount/unmount/mount from two
    // scanner instances fighting over the same DOM node.
    const target = document.createElement('div')
    target.id = `qr-reader-${Math.random().toString(36).slice(2)}`
    host.appendChild(target)

    const scanner = new Html5Qrcode(target.id, { verbose: false })
    let handled = false

    const started = scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          if (handled) return
          handled = true
          onScanRef.current(decodedText)
        },
        () => {
          // Per-frame "no QR found" callback; intentionally silent.
        },
      )
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        throw err
      })

    return () => {
      // stop() is only valid once start() has resolved, so chain onto it.
      started
        .then(() => scanner.stop())
        .then(() => scanner.clear())
        .catch(() => {})
        .finally(() => target.remove())
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-black/90 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-black">
        <div ref={hostRef} className="w-full" />
      </div>
      <p className="mt-4 text-center text-sm text-slate-300">
        {error ? `Camera unavailable: ${error}` : 'Point the camera at a Tathva location QR code'}
      </p>
      <button
        type="button"
        onClick={onClose}
        className="mt-6 rounded-full bg-white px-6 py-2 font-semibold text-slate-900 shadow-lg active:scale-95"
      >
        Close
      </button>
    </div>
  )
}
