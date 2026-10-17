export type PaletteDragPayload = {
  type: string
  customId?: string
}

const MIME_TYPE = 'application/reactflow'
const TEXT_PREFIX = 'playllm-node:'

let activePayload: PaletteDragPayload | null = null

export const writePaletteDrag = (dataTransfer: DataTransfer, payload: PaletteDragPayload) => {
  activePayload = payload
  dataTransfer.effectAllowed = 'copyMove'
  dataTransfer.setData(MIME_TYPE, payload.type)
  dataTransfer.setData('text/plain', `${TEXT_PREFIX}${JSON.stringify(payload)}`)
  if (payload.customId) dataTransfer.setData('application/playllm-custom-operator', payload.customId)
}

export const readPaletteDrag = (dataTransfer: DataTransfer): PaletteDragPayload | null => {
  const type = dataTransfer.getData(MIME_TYPE)
  const customId = dataTransfer.getData('application/playllm-custom-operator')
    || dataTransfer.getData('customOpId')

  if (type) return { type, customId: customId || undefined }

  const text = dataTransfer.getData('text/plain')
  if (text.startsWith(TEXT_PREFIX)) {
    try {
      const parsed = JSON.parse(text.slice(TEXT_PREFIX.length)) as PaletteDragPayload
      if (parsed.type) return parsed
    } catch {
      // Fall through to the in-memory payload used by restrictive browsers.
    }
  }

  return activePayload
}

export const clearPaletteDrag = () => {
  activePayload = null
}
