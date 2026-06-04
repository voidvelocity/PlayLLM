import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const dataDir = path.join(rootDir, 'server-data')
const usersDir = path.join(dataDir, 'users')
const graphsDir = path.join(dataDir, 'graphs')
const distDir = path.join(rootDir, 'dist')
const port = Number(process.env.PORT || 3001)
const host = process.env.HOST || '127.0.0.1'

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  response.end(JSON.stringify(payload))
}

const sendNotFound = response => sendJson(response, 404, { error: 'Not found' })

const sanitizeId = value => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!normalized) {
    throw new Error('A non-empty user or graph id is required')
  }

  return normalized
}

const readRequestBody = request => new Promise((resolve, reject) => {
  const chunks = []

  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    try {
      const raw = Buffer.concat(chunks).toString('utf8')
      resolve(raw ? JSON.parse(raw) : {})
    } catch (error) {
      reject(new Error('Invalid JSON body'))
    }
  })
  request.on('error', reject)
})

const ensureStorage = async () => {
  await mkdir(usersDir, { recursive: true })
  await mkdir(graphsDir, { recursive: true })
}

const userFilePath = userId => path.join(usersDir, `${sanitizeId(userId)}.json`)
const userGraphDir = userId => path.join(graphsDir, sanitizeId(userId))
const graphFilePath = (userId, graphId) => path.join(userGraphDir(userId), `${sanitizeId(graphId)}.json`)

const loadJsonIfExists = async filePath => {
  try {
    const content = await readFile(filePath, 'utf8')
    return JSON.parse(content)
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

const saveUserProfile = async userId => {
  const normalizedUserId = sanitizeId(userId)
  const now = new Date().toISOString()
  const filePath = userFilePath(normalizedUserId)
  const existing = await loadJsonIfExists(filePath)
  const profile = {
    id: normalizedUserId,
    displayName: existing?.displayName || normalizedUserId,
    updatedAt: now
  }

  await writeFile(filePath, JSON.stringify(profile, null, 2), 'utf8')
  return profile
}

const buildGraphSummary = record => ({
  id: record.id,
  name: record.name,
  userId: record.userId,
  updatedAt: record.updatedAt,
  nodeCount: record.document?.graph?.nodes?.length || 0,
  edgeCount: record.document?.graph?.edges?.length || 0
})

const listUserGraphs = async userId => {
  const dir = userGraphDir(userId)
  try {
    const entries = await readdir(dir)
    const records = await Promise.all(entries
      .filter(entry => entry.endsWith('.json'))
      .map(async entry => {
        const filePath = path.join(dir, entry)
        const content = await readFile(filePath, 'utf8')
        return JSON.parse(content)
      }))

    return records
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .map(buildGraphSummary)
  } catch (error) {
    if (error.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

const validateDocument = document => {
  if (!document || typeof document !== 'object') {
    throw new Error('Document is required')
  }
  if (document.format !== 'playllm-canvas') {
    throw new Error('Document format must be playllm-canvas')
  }
  if (document.version !== 1) {
    throw new Error('Unsupported document version')
  }
}

const listUsers = async () => {
  try {
    const entries = await readdir(usersDir)
    const users = await Promise.all(entries
      .filter(entry => entry.endsWith('.json'))
      .map(async entry => {
        const filePath = path.join(usersDir, entry)
        const profile = JSON.parse(await readFile(filePath, 'utf8'))
        const graphs = await listUserGraphs(profile.id)

        return {
          id: profile.id,
          displayName: profile.displayName || profile.id,
          graphCount: graphs.length,
          updatedAt: profile.updatedAt || new Date().toISOString()
        }
      }))

    return users.sort((a, b) => a.id.localeCompare(b.id))
  } catch (error) {
    if (error.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

const writeGraphRecord = async (userId, name, document) => {
  const normalizedUserId = sanitizeId(userId)
  const normalizedName = String(name || '').trim()
  if (!normalizedName) {
    throw new Error('Graph name is required')
  }

  validateDocument(document)

  await saveUserProfile(normalizedUserId)
  await mkdir(userGraphDir(normalizedUserId), { recursive: true })

  const graphId = `${sanitizeId(normalizedName)}-${Date.now().toString(36)}`
  const record = {
    id: graphId,
    name: normalizedName,
    userId: normalizedUserId,
    updatedAt: new Date().toISOString(),
    document
  }

  await writeFile(graphFilePath(normalizedUserId, graphId), JSON.stringify(record, null, 2), 'utf8')
  return buildGraphSummary(record)
}

const updateGraphRecord = async (userId, graphId, name, document) => {
  const normalizedUserId = sanitizeId(userId)
  const normalizedGraphId = sanitizeId(graphId)
  const normalizedName = String(name || '').trim()
  if (!normalizedName) {
    throw new Error('Graph name is required')
  }

  validateDocument(document)

  const filePath = graphFilePath(normalizedUserId, normalizedGraphId)
  const existing = await loadJsonIfExists(filePath)
  if (!existing) {
    throw new Error('Graph record not found')
  }

  await saveUserProfile(normalizedUserId)

  const record = {
    ...existing,
    id: normalizedGraphId,
    name: normalizedName,
    userId: normalizedUserId,
    updatedAt: new Date().toISOString(),
    document
  }

  await writeFile(filePath, JSON.stringify(record, null, 2), 'utf8')
  return buildGraphSummary(record)
}

const loadGraphRecord = async (userId, graphId) => {
  const record = await loadJsonIfExists(graphFilePath(userId, graphId))
  if (!record) {
    throw new Error('Graph record not found')
  }
  return record
}

const serveStaticFile = async (requestPath, response) => {
  const normalizedPath = requestPath === '/' ? '/index.html' : requestPath
  const filePath = path.resolve(distDir, `.${normalizedPath}`)

  if (!filePath.startsWith(distDir)) {
    sendNotFound(response)
    return
  }

  let finalPath = filePath
  if (!existsSync(finalPath)) {
    finalPath = path.join(distDir, 'index.html')
  }
  if (!existsSync(finalPath)) {
    sendJson(response, 503, { error: 'Frontend build not found. Run npm run build first.' })
    return
  }

  const fileInfo = await stat(finalPath)
  if (!fileInfo.isFile()) {
    sendNotFound(response)
    return
  }

  const ext = path.extname(finalPath)
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.svg': 'image/svg+xml'
  }

  response.writeHead(200, {
    'Content-Type': contentTypes[ext] || 'application/octet-stream'
  })
  createReadStream(finalPath).pipe(response)
}

const server = http.createServer(async (request, response) => {
  try {
    await ensureStorage()

    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
    const pathname = url.pathname
    const method = request.method || 'GET'

    if (pathname === '/api/users' && method === 'GET') {
      sendJson(response, 200, await listUsers())
      return
    }

    const userGraphsMatch = pathname.match(/^\/api\/users\/([^/]+)\/graphs$/)
    if (userGraphsMatch && method === 'GET') {
      sendJson(response, 200, await listUserGraphs(userGraphsMatch[1]))
      return
    }

    if (userGraphsMatch && method === 'POST') {
      const body = await readRequestBody(request)
      const summary = await writeGraphRecord(userGraphsMatch[1], body.name, body.document)
      sendJson(response, 201, summary)
      return
    }

    const graphRecordMatch = pathname.match(/^\/api\/users\/([^/]+)\/graphs\/([^/]+)$/)
    if (graphRecordMatch && method === 'GET') {
      sendJson(response, 200, await loadGraphRecord(graphRecordMatch[1], graphRecordMatch[2]))
      return
    }

    if (graphRecordMatch && method === 'PUT') {
      const body = await readRequestBody(request)
      const summary = await updateGraphRecord(graphRecordMatch[1], graphRecordMatch[2], body.name, body.document)
      sendJson(response, 200, summary)
      return
    }

    if (pathname.startsWith('/api/')) {
      sendNotFound(response)
      return
    }

    await serveStaticFile(pathname, response)
  } catch (error) {
    const status = String(error.message || '').includes('not found') ? 404 : 400
    sendJson(response, status, {
      error: error instanceof Error ? error.message : 'Unknown server error'
    })
  }
})

server.on('error', async error => {
  if (error.code === 'EADDRINUSE') {
    try {
      const response = await fetch(`http://${host}:${port}/api/users`)
      if (response.ok) {
        console.log(`PlayLLM API is already running on http://${host}:${port}`)
        process.exit(0)
      }
    } catch {
      // Ignore probe failures and fall back to the actionable error below.
    }

    console.error(`Port ${port} is already in use. Stop the existing process or run with PORT=<port> npm run api.`)
    process.exit(1)
  }

  if (error.code === 'EPERM') {
    console.error(`Unable to bind http://${host}:${port}. Try a different port: PORT=3210 npm run api`)
    process.exit(1)
  }

  console.error(error)
  process.exit(1)
})

server.listen(port, host, () => {
  console.log(`PlayLLM server listening on http://${host}:${port}`)
})
