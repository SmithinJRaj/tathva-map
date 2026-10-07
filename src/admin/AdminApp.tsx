import { useCallback, useEffect, useState } from 'react'
import { adminApi, ApiError, type Admin } from './api.ts'
import { LoginForm } from './LoginForm.tsx'
import { ScheduleList } from './ScheduleList.tsx'
import './admin.css'

type Session = { phase: 'loading' } | { phase: 'login' } | { phase: 'in'; admin: Admin } | { phase: 'offline' }

export default function AdminApp() {
  const [session, setSession] = useState<Session>({ phase: 'loading' })

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
      {session.phase === 'in' && (
        <ScheduleList
          admin={session.admin}
          onLogout={logout}
          onUnauthorized={() => setSession({ phase: 'login' })}
        />
      )}
    </div>
  )
}
