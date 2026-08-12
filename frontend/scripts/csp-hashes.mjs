/**
 * Regenerates the `script-src` hashes in the Content-Security-Policy header
 * stored in vercel.json.
 *
 * index.html carries an inline <script> that applies the saved theme before
 * first paint. Under a strict CSP that script only runs if its sha256 hash is
 * listed in script-src, and the hash changes whenever the script's text does —
 * including whitespace. Vercel reads vercel.json from the repo (not from the
 * build output), so the hash has to be committed.
 *
 * Usage:
 *   npm run build      # produce dist/index.html
 *   npm run csp        # rewrite vercel.json, then commit it
 *
 * Run with --check to verify without writing (exits 1 on drift), which is what
 * CI should do to catch an edited inline script that nobody re-hashed.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const htmlPath = resolve(root, 'dist/index.html')
const vercelPath = resolve(root, 'vercel.json')
const checkOnly = process.argv.includes('--check')

let html
try {
  html = readFileSync(htmlPath, 'utf8')
} catch {
  console.error(`✗ ${htmlPath} not found — run "npm run build" first.`)
  process.exit(1)
}

// Inline scripts only: a src= attribute means the browser fetches it and
// 'self' covers it, so it needs no hash.
const hashes = []
for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
  const body = m[1]
  if (!body.trim()) continue
  hashes.push(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`)
}

if (hashes.length === 0) {
  console.error('✗ No inline scripts found in dist/index.html — refusing to write an empty script-src.')
  process.exit(1)
}

const vercel = JSON.parse(readFileSync(vercelPath, 'utf8'))
const header = vercel.headers
  ?.flatMap(h => h.headers)
  .find(h => h.key === 'Content-Security-Policy')

if (!header) {
  console.error('✗ No Content-Security-Policy header found in vercel.json.')
  process.exit(1)
}

const before = header.value
// Keep every keyword/host source already in script-src, drop only stale hashes.
header.value = before.replace(/script-src ([^;]*)/, (_, sources) => {
  const kept = sources
    .trim()
    .split(/\s+/)
    .filter(s => !/^'sha(256|384|512)-/.test(s))
  return `script-src ${[...kept, ...hashes].join(' ')}`
})

if (header.value === before) {
  console.log(`✓ CSP already up to date (${hashes.length} inline script hash(es)).`)
  process.exit(0)
}

if (checkOnly) {
  console.error('✗ CSP in vercel.json is stale. Run "npm run csp" and commit the result.')
  console.error(`  expected script-src hashes: ${hashes.join(' ')}`)
  process.exit(1)
}

writeFileSync(vercelPath, `${JSON.stringify(vercel, null, 2)}\n`)
console.log(`✓ Updated CSP in vercel.json with ${hashes.length} inline script hash(es):`)
for (const h of hashes) console.log(`    ${h}`)
