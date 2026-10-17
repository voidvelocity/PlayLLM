import { GraphRecord, GraphRecordSummary, SavedCanvasDocument, UserSummary } from '../types'

const API_BASE = '/api'

export class ApiRequestError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
  }
}

const apiFetch = (input: string, init?: RequestInit) => fetch(input, {
  ...init,
  credentials: 'include'
})

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`
    let code: string | undefined

    try {
      const payload = await response.json() as { error?: string; code?: string; detail?: string | { error?: string; code?: string } }
      const detail = typeof payload.detail === 'object' ? payload.detail : undefined
      message = payload.error || detail?.error || (typeof payload.detail === 'string' ? payload.detail : message)
      code = payload.code || detail?.code
    } catch {
      // Ignore JSON parse failures and fall back to the default message.
    }

    throw new ApiRequestError(message, response.status, code)
  }

  return response.json() as Promise<T>
}

export const listUsers = async (): Promise<UserSummary[]> => {
  const response = await apiFetch(`${API_BASE}/users`)
  return readJson<UserSummary[]>(response)
}

export const listGraphsByUser = async (userId: string): Promise<GraphRecordSummary[]> => {
  const response = await apiFetch(`${API_BASE}/users/${encodeURIComponent(userId)}/graphs`)
  return readJson<GraphRecordSummary[]>(response)
}

export const getGraphByUser = async (userId: string, graphId: string): Promise<GraphRecord> => {
  const response = await apiFetch(`${API_BASE}/users/${encodeURIComponent(userId)}/graphs/${encodeURIComponent(graphId)}`)
  return readJson<GraphRecord>(response)
}

export const saveGraphByUser = async (
  userId: string,
  name: string,
  document: SavedCanvasDocument
): Promise<GraphRecordSummary> => {
  const response = await apiFetch(`${API_BASE}/users/${encodeURIComponent(userId)}/graphs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name, document })
  })

  return readJson<GraphRecordSummary>(response)
}

export const updateGraphByUser = async (
  userId: string,
  graphId: string,
  name: string,
  document?: SavedCanvasDocument
): Promise<GraphRecordSummary> => {
  const response = await apiFetch(`${API_BASE}/users/${encodeURIComponent(userId)}/graphs/${encodeURIComponent(graphId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name, document })
  })

  return readJson<GraphRecordSummary>(response)
}

export const deleteGraphByUser = async (userId: string, graphId: string): Promise<void> => {
  const response = await apiFetch(`${API_BASE}/users/${encodeURIComponent(userId)}/graphs/${encodeURIComponent(graphId)}`, {
    method: 'DELETE'
  })

  await readJson<{ ok: boolean }>(response)
}

export const getAuthSession = async (): Promise<UserSummary> => {
  const response = await apiFetch(`${API_BASE}/auth/session`)
  return readJson<UserSummary>(response)
}

export const loginUser = async (userId: string, password: string): Promise<UserSummary> => {
  const response = await apiFetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, password })
  })
  return readJson<UserSummary>(response)
}

export const registerUser = async (userId: string, password: string, displayName?: string): Promise<UserSummary> => {
  const response = await apiFetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, password, displayName })
  })
  return readJson<UserSummary>(response)
}

export const loginPublicUser = async (): Promise<UserSummary> => {
  const response = await apiFetch(`${API_BASE}/auth/public`, { method: 'POST' })
  return readJson<UserSummary>(response)
}

export const logoutUser = async (): Promise<void> => {
  const response = await apiFetch(`${API_BASE}/auth/logout`, { method: 'POST' })
  await readJson<{ ok: boolean }>(response)
}
