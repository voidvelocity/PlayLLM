import { useEffect, useRef, useState } from 'react'
import { useWorkspaceStore } from '../store/workspaceStore'
import { useUIStore } from '../store/uiStore'

const initialsFor = (value: string) => value.trim().slice(0, 2).toUpperCase() || 'U'

type AuthMode = 'signin' | 'register'

const UserMenu = () => {
  const currentUserId = useWorkspaceStore(state => state.currentUserId)
  const currentUserDisplayName = useWorkspaceStore(state => state.currentUserDisplayName)
  const currentUserIsPublic = useWorkspaceStore(state => state.currentUserIsPublic)
  const isBusy = useWorkspaceStore(state => state.isBusy)
  const signIn = useWorkspaceStore(state => state.signIn)
  const createAccount = useWorkspaceStore(state => state.createAccount)
  const signOut = useWorkspaceStore(state => state.signOut)
  const setActiveView = useUIStore(state => state.setActiveView)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<AuthMode>('signin')
  const [userId, setUserId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as globalThis.Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const resetForm = (nextMode = mode) => {
    setMode(nextMode)
    setUserId('')
    setDisplayName('')
    setPassword('')
    setConfirmPassword('')
    setError('')
  }

  const finishSwitch = () => {
    setActiveView('files')
    setOpen(false)
    resetForm('signin')
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!userId.trim() || !password) return
    if (mode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      if (mode === 'signin') await signIn(userId, password)
      else await createAccount(userId, password, displayName)
      finishSwitch()
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const openPublic = async () => {
    setSubmitting(true)
    setError('')
    try {
      if (currentUserIsPublic) {
        setOpen(false)
        return
      }
      await signOut()
      finishSwitch()
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(value => !value)}
        className="user-menu-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Account menu"
      >
        <span className={`user-avatar ${currentUserIsPublic ? 'is-public' : ''}`}>
          {initialsFor(currentUserDisplayName || currentUserId)}
        </span>
        <span className="hidden min-w-0 text-left 2xl:block">
          <span className="block max-w-[112px] truncate text-[11px] font-semibold text-slate-700">
            {currentUserDisplayName || currentUserId}
          </span>
          <span className="block text-[9px] text-slate-400">
            {currentUserIsPublic ? 'Public workspace' : `@${currentUserId}`}
          </span>
        </span>
        <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 text-slate-400 transition ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m5 8 5 5 5-5" /></svg>
      </button>

      {open && (
        <div className="user-menu-popover" role="dialog" aria-label="Account">
          <div className="account-summary">
            <span className={`user-avatar h-9 w-9 ${currentUserIsPublic ? 'is-public' : ''}`}>
              {initialsFor(currentUserDisplayName || currentUserId)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-800">{currentUserDisplayName || currentUserId}</span>
              <span className="block truncate text-[10px] text-slate-400">
                {currentUserIsPublic ? 'Shared with everyone · no password' : `Private account · @${currentUserId}`}
              </span>
            </span>
            <span className={`account-badge ${currentUserIsPublic ? 'is-public' : ''}`}>
              {currentUserIsPublic ? 'Public' : 'Private'}
            </span>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Account action">
            <button type="button" onClick={() => resetForm('signin')} className={mode === 'signin' ? 'is-active' : ''} role="tab" aria-selected={mode === 'signin'}>Sign in</button>
            <button type="button" onClick={() => resetForm('register')} className={mode === 'register' ? 'is-active' : ''} role="tab" aria-selected={mode === 'register'}>Create account</button>
          </div>

          <form className="space-y-3 px-4 pb-4" onSubmit={submit}>
            {mode === 'register' && (
              <label className="block">
                <span className="auth-label">Display name <span className="font-normal text-slate-400">(optional)</span></span>
                <input className="auth-input" value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="Your name" autoComplete="name" maxLength={80} />
              </label>
            )}
            <label className="block">
              <span className="auth-label">User ID</span>
              <input className="auth-input" value={userId} onChange={event => setUserId(event.target.value)} placeholder="e.g. alex-chen" autoComplete="username" required />
            </label>
            <label className="block">
              <span className="auth-label">Password</span>
              <input className="auth-input" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter your password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={mode === 'register' ? 8 : undefined} required />
            </label>
            {mode === 'register' && (
              <label className="block">
                <span className="auth-label">Confirm password</span>
                <input className="auth-input" type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Enter the password again" autoComplete="new-password" minLength={8} required />
              </label>
            )}
            {mode === 'register' && <p className="text-[10px] leading-4 text-slate-400">Creates a new private workspace. Use at least 8 characters and keep your password safe.</p>}
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button type="submit" className="auth-primary" disabled={submitting || isBusy || !userId.trim() || !password || (mode === 'register' && !confirmPassword)}>
              {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign in securely' : 'Create'}
            </button>
          </form>

          <div className="border-t border-slate-100 p-3">
            <button type="button" className="auth-public" onClick={() => void openPublic()} disabled={submitting || isBusy}>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3.5 10a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/><path d="M3.8 8h12.4M3.8 12h12.4M10 3.5c1.6 1.8 2.4 4 2.4 6.5s-.8 4.7-2.4 6.5C8.4 14.7 7.6 12.5 7.6 10S8.4 5.3 10 3.5Z"/></svg>
              </span>
              <span className="min-w-0 flex-1 text-left"><span className="block text-xs font-semibold text-slate-700">{currentUserIsPublic ? 'Continue as public' : 'Sign out to public'}</span><span className="block text-[9px] text-slate-400">No password · files are visible to everyone</span></span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default UserMenu
