import { GraphRecord, GraphRecordSummary, SavedCanvasDocument, UserSummary } from '../types'

const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:3001/api' : '/api'

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`

    try {
      const payload = await response.json() as { error?: string }
      if (payload.error) {
        message = payload.error
      }
    } catch {
      // Ignore JSON parse failures and fall back to the default message.
    }

    throw new Error(message)
  }

  return response.json() as Promise<T>
}

export const listUsers = async (): Promise<UserSummary[]> => {
  const response = await fetch(`${API_BASE}/users`)
  return readJson<UserSummary[]>(response)
}

export const listGraphsByUser = async (userId: string): Promise<GraphRecordSummary[]> => {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/graphs`)
  return readJson<GraphRecordSummary[]>(response)
}

export const getGraphByUser = async (userId: string, graphId: string): Promise<GraphRecord> => {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/graphs/${encodeURIComponent(graphId)}`)
  return readJson<GraphRecord>(response)
}

export const saveGraphByUser = async (
  userId: string,
  name: string,
  document: SavedCanvasDocument
): Promise<GraphRecordSummary> => {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/graphs`, {
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
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/graphs/${encodeURIComponent(graphId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name, document })
  })

  return readJson<GraphRecordSummary>(response)
}

export const deleteGraphByUser = async (userId: string, graphId: string): Promise<void> => {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/graphs/${encodeURIComponent(graphId)}`, {
    method: 'DELETE'
  })

  await readJson<{ ok: boolean }>(response)
}
