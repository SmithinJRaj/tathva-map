import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { routablePlaces, type Place, type PlaceCategory } from '../data/campus'
import { MY_LOCATION } from '../hooks/useRouting'
import { searchPlaces } from '../lib/placeSearch'

/** The live-position entry, shaped like a place so it can sit in the same list. */
const MY_LOCATION_OPTION = {
  id: MY_LOCATION,
  name: 'My location',
  category: 'amenity' as PlaceCategory,
}

type Option = Pick<Place, 'id' | 'name' | 'category'> & { floor?: number }

interface Props {
  label: string
  value: string | null
  onChange: (id: string | null) => void
  allowMyLocation?: boolean
}

/**
 * A type-to-search picker for one end of a trip.
 *
 * It was a native <select>, which is unbeatable for a short list and hopeless for ninety
 * names: you cannot type "oat", only scroll. This keeps the field looking the same but
 * filters as you type, ranked by `searchPlaces`, with the keyboard behaviour people expect
 * from a combobox. The chosen name shows when the field is not being edited, so at rest it
 * still reads as a filled-in field rather than a search box.
 */
export function PlaceField({ label, value, onChange, allowMyLocation = false }: Props) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // The highlight belongs to one particular result set. Rather than reset it from an effect
  // — which would commit a render and immediately queue another — it is adjusted during
  // render whenever the query or the open state moves it onto a different list.
  const [highlight, setHighlight] = useState({ index: 0, key: '' })
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const options: Option[] = useMemo(
    () => (allowMyLocation ? [MY_LOCATION_OPTION, ...routablePlaces] : routablePlaces),
    [allowMyLocation],
  )

  const selected = value ? options.find((o) => o.id === value) : undefined
  const matches = useMemo(
    () => (open ? searchPlaces(options, query) : []),
    [open, options, query],
  )

  const listKey = `${open}:${query}`
  if (highlight.key !== listKey) setHighlight({ index: 0, key: listKey })
  const active = highlight.key === listKey ? highlight.index : 0
  const setActive = (index: number) => setHighlight({ index, key: listKey })

  // Keep the highlighted row in view when arrowing past the edge of the scroll box.
  useEffect(() => {
    if (!open) return
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  // A tap outside is a dismissal, not a choice.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const choose = (option: Option) => {
    onChange(option.id)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive(matches.length === 0 ? 0 : (active + step + matches.length) % matches.length)
    } else if (e.key === 'Enter') {
      if (open && matches[active]) {
        e.preventDefault()
        choose(matches[active])
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        setOpen(false)
        setQuery('')
      }
    }
  }

  const label_ = `${label} location`
  return (
    <div className="field-wrap" ref={rootRef}>
      <div className={`field ${open ? 'is-open' : ''}`}>
        <span className="field-tag pix-sm" style={{ color: 'var(--muted)' }} aria-hidden>
          {label}
        </span>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={label_}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          // The browser's own suggestions would cover the list on a phone.
          autoCorrect="off"
          spellCheck={false}
          placeholder="Search campus…"
          value={open ? query : (selected?.name ?? '')}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            setQuery('')
            setOpen(true)
          }}
          onKeyDown={onKeyDown}
        />
        {selected && !open ? (
          <button
            type="button"
            className="field-clear"
            aria-label={`Clear ${label_}`}
            onClick={() => onChange(null)}
          >
            ×
          </button>
        ) : (
          <span className="field-caret" aria-hidden>
            <svg viewBox="0 0 10 6" className="h-2 w-3" fill="currentColor">
              <path d="M0 0h10L5 6z" />
            </svg>
          </span>
        )}
      </div>

      {open && (
        <ul className="field-options slab" id={listId} role="listbox" aria-label={label_} ref={listRef}>
          {matches.length === 0 ? (
            <li className="field-empty term">Nothing matches “{query}”</li>
          ) : (
            matches.map((option, i) => (
              <li
                key={option.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`field-option ${i === active ? 'is-active' : ''}`}
                // Click, not pointerdown. A touch scroll *starts* with a pointerdown on
                // whichever row is under the finger, so selecting there made the list
                // impossible to scroll — and preventDefault on it cancelled the browser's
                // scroll gesture outright. Click fires only for a tap. Nothing is lost by
                // waiting: the list closes from the document listener below, which ignores
                // anything inside this component, so a click on a row never races it shut.
                onClick={() => choose(option)}
                // Mouse, not pointer: a pointerenter fires while a finger drags past rows
                // and would drag the highlight along with the scroll.
                onMouseEnter={() => setActive(i)}
              >
                <span className="field-option-dot" data-category={option.category} aria-hidden />
                <span className="term field-option-name">{option.name}</span>
                {option.floor ? <span className="pix-sm field-option-floor">fl {option.floor}</span> : null}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
