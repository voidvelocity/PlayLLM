import { rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const viteCache = resolve(projectRoot, 'node_modules', '.vite')

await rm(viteCache, { recursive: true, force: true })
console.log('Cleared Vite dependency cache.')
