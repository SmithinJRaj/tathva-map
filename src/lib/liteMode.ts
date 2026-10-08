import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'tathva-map:lite'

export interface DeviceHints {
  /** navigator.hardwareConcurrency; undefined where the browser doesn't say. */
  cores: number | undefined
  /** The Data Saver flag from the Network Information API, where it exists. */
  saveData: boolean | undefined
  reducedMotion: boolean
}

/**
 * Four cores or fewer is where the glow filters and the fly-to animation start to stutter on
 * campus phones. A browser that hides its core count is given the benefit of the doubt.
 */
export function detectLite({ cores, saveData, reducedMotion }: DeviceHints): boolean {
  return (cores !== undefined && cores <= 4) || saveData === true || reducedMotion
}

function deviceHints(): DeviceHints {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  return {
    cores: navigator.hardwareConcurrency || undefined,
    saveData: connection?.saveData,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  }
}

function defaultStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** The viewer's own choice, which beats detection; null when they never made one. */
export function readLiteOverride(storage: Storage | null = defaultStorage()): boolean | null {
  try {
    const value = storage?.getItem(STORAGE_KEY)
    return value === '1' ? true : value === '0' ? false : null
  } catch {
    return null
  }
}

export function saveLiteOverride(on: boolean, storage: Storage | null = defaultStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, on ? '1' : '0')
  } catch {
    // Private mode or blocked storage: the choice just lasts for this visit.
  }
}

/** Lite mode for this device, kept in sync with the `data-lite` flag the styles key off. */
export function useLiteMode(): [lite: boolean, setLite: (on: boolean) => void] {
  const [override, setOverride] = useState(() => readLiteOverride())
  const [auto] = useState(() => detectLite(deviceHints()))
  const lite = override ?? auto

  useEffect(() => {
    document.documentElement.toggleAttribute('data-lite', lite)
  }, [lite])

  const setLite = useCallback((on: boolean) => {
    saveLiteOverride(on)
    setOverride(on)
  }, [])

  return [lite, setLite]
}
