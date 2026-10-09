import { useCallback, useEffect, useState } from 'react'
import type { ScheduleEvent } from '../../shared/schedule.ts'
import { adminApi, ApiError, type Admin } from './api.ts'
import { AuditLog } from './AuditLog.tsx'
import { EventForm } from './EventForm.tsx'
import { draftFromParsed, type EventDraft } from './eventDraft.ts'
import { LoginForm } from './LoginForm.tsx'
import { PasteForm } from './PasteForm.tsx'
import { ScheduleList } from './ScheduleList.tsx'
import './admin.css'

type Session = { phase: 'loading' } | { phase: 'login' } | { phase: 'in'; admin: Admin } | { phase: 'offline' }

type View =
  | { page: 'list' }
  | { page: 'paste' }
  | { page: 'history' }
  | { page: 'form'; event?: ScheduleEvent; draft?: EventDraft; problems?: string[] }

export default function AdminApp() {
  const [session, setSession] = useState<Session>({ phase: 'loading' })
  // Lives here, not in the form, so a 401 mid-edit keeps the inputs through re-login.
  const [view, setView] = useState<View>({ page: 'list' })
  const toList = () => setView({ page: 'list' })
  const unauthorized = useCallback(() => setSession({ phase: 'login' }), [])
  const trackDraft = useCallback(
    (draft: EventDraft) => setView((cur) => (cur.page === 'form' ? { ...cur, draft } : cur)),
    [],
  )

  const check = useCallback(() => {
    adminApi
      .me()
      .then((admin) => setSession({ phase: 'in', admin }))
      .catch((err) =>
        setSession(err instanceof ApiError && err.status === 401 ? { phase: 'login' } : { phase: 'offline' }),
      )
  }, [])

  useEffect(check, [check])

  async function logout() {
    try {
      await adminApi.logout()
    } catch {
      // a dead session is as good as logged out
    }
    setView({ page: 'list' })
    setSession({ phase: 'login' })
  }

  return (
    <div className="space-bg admin-page">
      {session.phase === 'loading' && <p className="term admin-note">Loading…</p>}
      {session.phase === 'offline' && (
        <div className="slab admin-login">
          <p className="term admin-error" role="alert">
            Can't reach server
          </p>
          <button type="button" className="btn" onClick={check}>
            Retry
          </button>
        </div>
      )}
      {session.phase === 'login' && (
        <LoginForm onLoggedIn={(admin) => setSession({ phase: 'in', admin })} />
      )}
      {session.phase === 'in' && view.page === 'list' && (
        <ScheduleList
          admin={session.admin}
          onLogout={logout}
          onUnauthorized={unauthorized}
          onAdd={() => setView({ page: 'form' })}
          onPaste={() => setView({ page: 'paste' })}
          onHistory={() => setView({ page: 'history' })}
          onEdit={(event) => setView({ page: 'form', event })}
        />
      )}
      {session.phase === 'in' && view.page === 'paste' && (
        <PasteForm
          // Straight into the ordinary form, with what the parser worked out filled in and what
          // it could not listed above the fields. Nothing is stored until Create.
          onParsed={(parsed) =>
            setView({ page: 'form', draft: draftFromParsed(parsed.draft), problems: parsed.problems })
          }
          onCancel={toList}
          onUnauthorized={unauthorized}
        />
      )}
      {session.phase === 'in' && view.page === 'history' && (
        <AuditLog onBack={toList} onUnauthorized={unauthorized} />
      )}
      {session.phase === 'in' && view.page === 'form' && (
        <EventForm
          event={view.event}
          draft={view.draft}
          problems={view.problems}
          onDraftChange={trackDraft}
          onSaved={toList}
          onCancel={toList}
          onUnauthorized={unauthorized}
        />
      )}
    </div>
  )
}
