/**
 * Generates PWA icons from public/icon.svg:
 *   - apple-touch-icon.png (180×180)
 *   - pwa-192x192.png      (192×192)
 *   - pwa-512x512.png      (512×512)
 *
 * Run:  npm run icons
 */
import { readFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public')
const svg = await readFile(join(publicDir, 'icon.svg'))

await mkdir(publicDir, { recursive: true })

const jobs = [
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'pwa-192x192.png' },
  { size: 512, name: 'pwa-512x512.png' },
]

for (const { size, name } of jobs) {
  await sharp(svg).resize(size, size).png().toFile(join(publicDir, name))
  console.log(`✓ ${name} (${size}×${size})`)
}

console.log('Icons generated.')
