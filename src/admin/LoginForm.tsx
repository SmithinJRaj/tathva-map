import { useState, type FormEvent } from 'react'
import { adminApi, ApiError, type Admin } from './api.ts'

interface Props {
  onLoggedIn: (admin: Admin) => void
}

export function LoginForm({ onLoggedIn }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onLoggedIn(await adminApi.login(username, password))
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0
      setError(
        status === 401
          ? 'Wrong username or password'
          : status === 429
            ? 'Too many attempts, try again later'
            : status === 0
              ? "Can't reach server"
              : 'Something went wrong, try again',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="slab admin-login" onSubmit={submit}>
      <h1 className="pix admin-title">Tathva admin</h1>
      <label className="field">
        <span className="field-tag pix-sm">User</span>
        <input
          className="term"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoFocus
          required
        />
      </label>
      <label className="field">
        <span className="field-tag pix-sm">Pass</span>
        <input
          className="term"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      {error && (
        <p className="term admin-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        Log in
      </button>
    </form>
  )
}
