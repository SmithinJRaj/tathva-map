import { useState, type FormEvent } from 'react'
import { adminApi, ApiError, type ParsedAnnouncement } from './api.ts'

interface Props {
  onParsed: (parsed: ParsedAnnouncement) => void
  onCancel: () => void
  onUnauthorized?: () => void
}

/**
 * Paste a poster caption, get a draft to check.
 *
 * The parse runs on the WhatsApp bridge, which asks a language model to read the text. Nothing
 * it says is stored: the answer opens the ordinary event form with the fields filled in, and
 * the event exists only once a person has read it and pressed Create. That is the whole safety
 * argument for letting a model near the schedule, so the screen says so out loud.
 */
export function PasteForm({ onParsed, onCancel, onUnauthorized }: Props) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return setMessage('Paste the announcement text first')
    setBusy(true)
    setMessage(null)
    try {
      onParsed(await adminApi.parse(text))
    } catch (err) {
      if (!(err instanceof ApiError)) setMessage('Something went wrong, try again')
      else if (err.status === 401) onUnauthorized?.()
      else if (err.status === 502) setMessage("The reader isn't running — add the event by hand instead")
      else if (err.status === 429) setMessage('Too many reads just now; wait a few minutes')
      else if (err.status === 400) setMessage(err.fields?.text ?? 'That text could not be sent')
      else setMessage(err.status === 0 ? "Can't reach server" : 'Something went wrong, try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="slab admin-form" onSubmit={submit} noValidate>
      <h1 className="pix admin-title">Add from text</h1>
      <p className="term admin-note">
        Paste a poster caption or a message. It comes back as a draft you check and save — nothing
        is added until you do.
      </p>

      <div className="form-row">
        <label className="field">
          <span className="field-tag pix-sm">Text</span>
          <textarea
            className="term"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={4000}
            placeholder={'Robowars finals are on Day 2, 2pm to 4pm at the Open Air Theatre'}
            autoFocus
          />
        </label>
      </div>

      {message && (
        <p className="term admin-error" role="alert">
          {message}
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Reading…' : 'Read text'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  )
}
