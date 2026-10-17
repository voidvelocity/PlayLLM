import { createReadStream, existsSync } from 'node:fs'
import { chmod, copyFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const dataDir = path.resolve(process.env.PLAYLLM_DATA_DIR || path.join(rootDir, 'server-data'))
const usersDir = path.join(dataDir, 'users')
const graphsDir = path.join(dataDir, 'graphs')
const legacyArchiveDir = path.join(dataDir, 'legacy-archive')
const distDir = path.join(rootDir, 'dist')
const port = Number(process.env.PLAYLLM_PORT || process.env.PORT || 3001)
const host = process.env.PLAYLLM_HOST || process.env.HOST || '127.0.0.1'
const publicUserId = process.env.PLAYLLM_PUBLIC_USER || 'public'
const sessionCookie = 'playllm_session'
const sessionTtlSeconds = 7 * 24 * 60 * 60
const passwordIterations = 600_000
const sessions = new Map()
const loginAttempts = new Map()

class ApiError extends Error {
  constructor(status, message, code = 'request_failed') {
    super(message)
    this.status = status
    this.code = code
  }
}

const sanitizeId = value => {
  const normalized = String(value || '').trim().toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!normalized) throw new ApiError(400, 'A non-empty user or graph id is required')
  return normalized
}

const publicId = () => sanitizeId(publicUserId)
const userFilePath = userId => path.join(usersDir, `${sanitizeId(userId)}.json`)
const userGraphDir = userId => path.join(graphsDir, sanitizeId(userId))
const graphFilePath = (userId, graphId) => path.join(userGraphDir(userId), `${sanitizeId(graphId)}.json`)

const loadJsonIfExists = async filePath => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

const writeJsonAtomic = async (filePath, payload) => {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.tmp`
  await writeFile(temporaryPath, JSON.stringify(payload), 'utf8')
  await chmod(temporaryPath, 0o600)
  await rename(temporaryPath, filePath)
}

const ensureStorage = async () => {
  await mkdir(usersDir, { recursive: true })
  await mkdir(graphsDir, { recursive: true })
  const filePath = userFilePath(publicId())
  const existing = await loadJsonIfExists(filePath)
  const profile = {
    ...(existing || {}),
    id: publicId(),
    displayName: existing?.displayName || 'Public',
    isPublic: true,
    updatedAt: existing?.updatedAt || new Date().toISOString()
  }
  delete profile.passwordHash
  if (!existing || !existing.isPublic || existing.passwordHash) await writeJsonAtomic(filePath, profile)
}

const readRequestBody = request => new Promise((resolve, reject) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    try {
      const raw = Buffer.concat(chunks).toString('utf8')
      resolve(raw ? JSON.parse(raw) : {})
    } catch {
      reject(new ApiError(400, 'Invalid JSON body'))
    }
  })
  request.on('error', reject)
})

const parseCookies = request => Object.fromEntries(
  String(request.headers.cookie || '').split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const separator = part.indexOf('=')
    return separator < 0 ? [part, ''] : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))]
  })
)

const sessionHeader = (request, token, clear = false) => {
  const parts = [`${sessionCookie}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict']
  if (clear) parts.push('Max-Age=0', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT')
  else parts.push(`Max-Age=${sessionTtlSeconds}`)
  if (request.headers['x-forwarded-proto'] === 'https') parts.push('Secure')
  return parts.join('; ')
}

const sendJson = (response, statusCode, payload, headers = {}) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  })
  response.end(JSON.stringify(payload))
}

const listUserGraphs = async userId => {
  const dir = userGraphDir(userId)
  try {
    const entries = await readdir(dir)
    const records = await Promise.all(entries.filter(entry => entry.endsWith('.json')).map(async entry =>
      JSON.parse(await readFile(path.join(dir, entry), 'utf8'))
    ))
    return records.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).map(buildGraphSummary)
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

const publicProfile = async profile => ({
  id: profile.id,
  displayName: profile.displayName || profile.id,
  graphCount: (await listUserGraphs(profile.id)).length,
  updatedAt: profile.updatedAt || new Date().toISOString(),
  isPublic: profile.id === publicId(),
  passwordConfigured: Boolean(profile.passwordHash)
})

const hashPassword = password => {
  const salt = randomBytes(16)
  const digest = pbkdf2Sync(password, salt, passwordIterations, 32, 'sha256')
  return `pbkdf2_sha256$${passwordIterations}$${salt.toString('base64')}$${digest.toString('base64')}`
}

const verifyPassword = (password, encoded) => {
  try {
    const [algorithm, iterations, saltText, digestText] = encoded.split('$')
    if (algorithm !== 'pbkdf2_sha256') return false
    const expected = Buffer.from(digestText, 'base64')
    const actual = pbkdf2Sync(password, Buffer.from(saltText, 'base64'), Number(iterations), expected.length, 'sha256')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

const validatePassword = password => {
  if (typeof password !== 'string' || password.length < 8) {
    throw new ApiError(400, 'Password must contain at least 8 characters', 'weak_password')
  }
  if (password.length > 128) throw new ApiError(400, 'Password must not exceed 128 characters', 'weak_password')
}

const archiveLegacyWorkspace = async userId => {
  const normalizedId = sanitizeId(userId)
  const stamp = new Date().toISOString().replace(/[-:.]/g, '')
  const archiveRoot = path.join(legacyArchiveDir, `${normalizedId}-${stamp}`)
  const archivedUsersDir = path.join(archiveRoot, 'users')
  await mkdir(archivedUsersDir, { recursive: true })
  const profilePath = userFilePath(normalizedId)
  if (existsSync(profilePath)) await copyFile(profilePath, path.join(archivedUsersDir, path.basename(profilePath)))
  const graphDir = userGraphDir(normalizedId)
  if (existsSync(graphDir)) {
    const archivedGraphsDir = path.join(archiveRoot, 'graphs')
    await mkdir(archivedGraphsDir, { recursive: true })
    await rename(graphDir, path.join(archivedGraphsDir, normalizedId))
  }
}

const registerUser = async ({ userId, password, displayName }) => {
  const normalizedId = sanitizeId(userId)
  if (normalizedId === publicId()) throw new ApiError(409, 'The public account cannot be registered', 'public_account')
  validatePassword(password)
  const filePath = userFilePath(normalizedId)
  const existing = await loadJsonIfExists(filePath)
  if (existing?.passwordHash) throw new ApiError(409, 'This user ID is already registered', 'user_exists')
  if (existing) await archiveLegacyWorkspace(normalizedId)
  const normalizedDisplayName = String(displayName || '').trim()
  if (normalizedDisplayName.length > 80) throw new ApiError(400, 'Display name must not exceed 80 characters', 'invalid_display_name')
  const profile = {
    id: normalizedId,
    displayName: normalizedDisplayName || normalizedId,
    passwordHash: hashPassword(password),
    isPublic: false,
    updatedAt: new Date().toISOString()
  }
  await writeJsonAtomic(filePath, profile)
  return profile
}

const authenticateUser = async (userId, password, clientKey) => {
  const normalizedId = sanitizeId(userId)
  const rateKey = `${clientKey}:${normalizedId}`
  const now = Date.now()
  const recentAttempts = (loginAttempts.get(rateKey) || []).filter(stamp => now - stamp < 60_000)
  loginAttempts.set(rateKey, recentAttempts)
  if (recentAttempts.length >= 5) throw new ApiError(429, 'Too many sign-in attempts. Try again in one minute.', 'rate_limited')
  const profile = await loadJsonIfExists(userFilePath(normalizedId))
  if (normalizedId === publicId() && profile) return profile
  if (!profile || !profile.passwordHash || !verifyPassword(String(password || ''), profile.passwordHash)) {
    recentAttempts.push(now)
    loginAttempts.set(rateKey, recentAttempts)
    throw new ApiError(401, 'Invalid user ID or password', 'invalid_credentials')
  }
  loginAttempts.delete(rateKey)
  return profile
}

const createSession = userId => {
  const token = randomBytes(32).toString('base64url')
  sessions.set(token, { userId: sanitizeId(userId), expiresAt: Date.now() + sessionTtlSeconds * 1000 })
  return token
}

const requireUser = (request, requestedUserId) => {
  const token = parseCookies(request)[sessionCookie]
  const session = token ? sessions.get(token) : null
  if (!session || session.expiresAt <= Date.now()) {
    if (token) sessions.delete(token)
    throw new ApiError(401, 'Sign in is required', 'authentication_required')
  }
  if (requestedUserId && session.userId !== sanitizeId(requestedUserId)) {
    throw new ApiError(403, 'You do not have access to this workspace', 'forbidden')
  }
  return session.userId
}

const validateDocument = document => {
  if (!document || typeof document !== 'object') throw new ApiError(400, 'Document is required')
  if (document.format !== 'playllm-canvas') throw new ApiError(400, 'Document format must be playllm-canvas')
  if (document.version !== 1 && document.version !== 2) throw new ApiError(400, 'Unsupported document version')
}

function buildGraphSummary(record) {
  return {
    id: record.id,
    name: record.name,
    userId: record.userId,
    updatedAt: record.updatedAt,
    nodeCount: record.document?.graph?.nodes?.length || 0,
    edgeCount: record.document?.graph?.edges?.length || 0
  }
}

const writeGraphRecord = async (userId, name, document) => {
  const normalizedUserId = sanitizeId(userId)
  const normalizedName = String(name || '').trim()
  if (!normalizedName) throw new ApiError(400, 'Graph name is required')
  validateDocument(document)
  await mkdir(userGraphDir(normalizedUserId), { recursive: true })
  const graphId = `${sanitizeId(normalizedName)}-${Date.now().toString(36)}`
  const record = { id: graphId, name: normalizedName, userId: normalizedUserId, updatedAt: new Date().toISOString(), document }
  await writeJsonAtomic(graphFilePath(normalizedUserId, graphId), record)
  return buildGraphSummary(record)
}

const loadGraphRecord = async (userId, graphId) => {
  const record = await loadJsonIfExists(graphFilePath(userId, graphId))
  if (!record) throw new ApiError(404, 'Graph record not found', 'not_found')
  return record
}

const updateGraphRecord = async (userId, graphId, name, document) => {
  const existing = await loadGraphRecord(userId, graphId)
  const normalizedName = String(name || '').trim()
  if (!normalizedName) throw new ApiError(400, 'Graph name is required')
  const effectiveDocument = document === undefined ? existing.document : document
  validateDocument(effectiveDocument)
  const record = { ...existing, name: normalizedName, updatedAt: new Date().toISOString(), document: effectiveDocument }
  await writeJsonAtomic(graphFilePath(userId, graphId), record)
  return buildGraphSummary(record)
}

const serveStaticFile = async (requestPath, response) => {
  const normalizedPath = requestPath === '/' ? '/index.html' : requestPath
  const filePath = path.resolve(distDir, `.${normalizedPath}`)
  if (!filePath.startsWith(`${distDir}${path.sep}`)) throw new ApiError(404, 'Not found', 'not_found')
  const finalPath = existsSync(filePath) ? filePath : path.join(distDir, 'index.html')
  if (!existsSync(finalPath)) throw new ApiError(503, 'Frontend build not found. Run npm run build first.')
  if (!(await stat(finalPath)).isFile()) throw new ApiError(404, 'Not found', 'not_found')
  const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' }
  response.writeHead(200, { 'Content-Type': contentTypes[path.extname(finalPath)] || 'application/octet-stream' })
  createReadStream(finalPath).pipe(response)
}

const server = http.createServer(async (request, response) => {
  try {
    await ensureStorage()
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
    const pathname = decodeURIComponent(url.pathname)
    const method = request.method || 'GET'

    if (pathname === '/api/auth/session' && method === 'GET') {
      const userId = requireUser(request)
      sendJson(response, 200, await publicProfile(await loadJsonIfExists(userFilePath(userId))))
      return
    }
    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = await readRequestBody(request)
      const profile = await authenticateUser(body.userId, body.password, request.socket.remoteAddress || 'unknown')
      sendJson(response, 200, await publicProfile(profile), { 'Set-Cookie': sessionHeader(request, createSession(profile.id)) })
      return
    }
    if (pathname === '/api/auth/register' && method === 'POST') {
      const profile = await registerUser(await readRequestBody(request))
      sendJson(response, 201, await publicProfile(profile), { 'Set-Cookie': sessionHeader(request, createSession(profile.id)) })
      return
    }
    if (pathname === '/api/auth/public' && method === 'POST') {
      const profile = await loadJsonIfExists(userFilePath(publicId()))
      sendJson(response, 200, await publicProfile(profile), { 'Set-Cookie': sessionHeader(request, createSession(profile.id)) })
      return
    }
    if (pathname === '/api/auth/logout' && method === 'POST') {
      const token = parseCookies(request)[sessionCookie]
      if (token) sessions.delete(token)
      sendJson(response, 200, { ok: true }, { 'Set-Cookie': sessionHeader(request, '', true) })
      return
    }
    if (pathname === '/api/users' && method === 'GET') {
      const userId = requireUser(request)
      sendJson(response, 200, [await publicProfile(await loadJsonIfExists(userFilePath(userId)))])
      return
    }

    const userGraphsMatch = pathname.match(/^\/api\/users\/([^/]+)\/graphs$/)
    if (userGraphsMatch) {
      const userId = userGraphsMatch[1]
      requireUser(request, userId)
      if (method === 'GET') sendJson(response, 200, await listUserGraphs(userId))
      else if (method === 'POST') {
        const body = await readRequestBody(request)
        sendJson(response, 201, await writeGraphRecord(userId, body.name, body.document))
      } else throw new ApiError(405, 'Method not allowed')
      return
    }

    const graphRecordMatch = pathname.match(/^\/api\/users\/([^/]+)\/graphs\/([^/]+)$/)
    if (graphRecordMatch) {
      const [, userId, graphId] = graphRecordMatch
      requireUser(request, userId)
      if (method === 'GET') sendJson(response, 200, await loadGraphRecord(userId, graphId))
      else if (method === 'PUT') {
        const body = await readRequestBody(request)
        sendJson(response, 200, await updateGraphRecord(userId, graphId, body.name, body.document))
      } else if (method === 'DELETE') {
        if (!existsSync(graphFilePath(userId, graphId))) throw new ApiError(404, 'Graph record not found', 'not_found')
        await unlink(graphFilePath(userId, graphId))
        sendJson(response, 200, { ok: true })
      } else throw new ApiError(405, 'Method not allowed')
      return
    }

    if (pathname.startsWith('/api/')) throw new ApiError(404, 'Not found', 'not_found')
    await serveStaticFile(pathname, response)
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500
    sendJson(response, status, {
      error: error instanceof Error ? error.message : 'Unknown server error',
      ...(error instanceof ApiError ? { code: error.code } : {})
    })
  }
})

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Stop the existing PlayLLM server and run npm run api again.`)
    process.exit(1)
  }
  console.error(error)
  process.exit(1)
})

server.listen(port, host, () => {
  console.log(`PlayLLM server listening on http://${host}:${port}`)
})
