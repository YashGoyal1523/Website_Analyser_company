#!/usr/bin/env node
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CLIENT = path.join(ROOT, 'client')
const SERVER = path.join(ROOT, 'server')
const OUT = path.join(ROOT, 'dist-package')
const APP_OUT = path.join(OUT, 'app')
const NODE_OUT = path.join(OUT, 'node')

function run(cmd, cwd) {
  console.log(`> ${cmd}  (in ${cwd})`)
  execSync(cmd, { cwd, stdio: 'inherit' })
}

function copyDir(src, dest, { exclude = [] } = {}) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (exclude.includes(entry.name)) continue
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isSymbolicLink()) {
      fs.symlinkSync(fs.readlinkSync(s), d)
    } else if (entry.isDirectory()) {
      copyDir(s, d, { exclude })
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d)
    }
    // Anything else (sockets, FIFOs, device files) isn't copyable and isn't needed in a
    // static bundle anyway - see the identical helper in package-mac.mjs for why this
    // can come up (a downloaded browser's crash-handler IPC socket).
  }
}

async function latestLtsWindowsZip() {
  const res = await fetch('https://nodejs.org/dist/index.json')
  if (!res.ok) throw new Error(`Failed to fetch Node.js release index: ${res.status}`)
  const versions = await res.json()
  const lts = versions.find((v) => v.lts)
  if (!lts) throw new Error('Could not find a Node.js LTS release in the index')
  return { version: lts.version, url: `https://nodejs.org/dist/${lts.version}/node-${lts.version}-win-x64.zip` }
}

async function downloadFile(url, dest) {
  console.log(`> downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`)
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}

function extractZip(zipPath, destDir) {
  console.log(`> extracting ${zipPath}`)
  if (process.platform === 'win32') {
    // `tar` on Windows runners can resolve to a GNU tar build that misreads
    // drive-letter paths like "D:\..." as a remote "host:file" spec and fails
    // with "Cannot connect to D:". PowerShell's Expand-Archive has no such issue.
    execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, { stdio: 'inherit' })
  } else {
    execSync(`unzip -q "${zipPath}" -d "${destDir}"`, { stdio: 'inherit' })
  }
}

// The official Node.js zip has everything nested one level down inside
// "node-vX.Y.Z-win-x64/" - flatten that so node.exe lands directly in destDir.
function flattenSingleSubdir(destDir) {
  const entries = fs.readdirSync(destDir, { withFileTypes: true })
  if (entries.length !== 1 || !entries[0].isDirectory()) return
  const inner = path.join(destDir, entries[0].name)
  for (const entry of fs.readdirSync(inner, { withFileTypes: true })) {
    fs.renameSync(path.join(inner, entry.name), path.join(destDir, entry.name))
  }
  fs.rmdirSync(inner)
}

const START_BAT = [
  '@echo off',
  'cd /d "%~dp0app"',
  '"%~dp0node\\node.exe" server.js',
  'pause',
].join('\r\n') + '\r\n'

async function main() {
  const { MONGODB_URI, JWT_SECRET, PORT = '4000' } = process.env
  if (!MONGODB_URI || !JWT_SECRET) {
    throw new Error('MONGODB_URI and JWT_SECRET must be set in the environment before packaging (in CI these come from repo secrets).')
  }

  console.log('== 1/5: build client (outputs straight into server/public via client/vite.config.js) ==')
  run('npm ci', CLIENT)
  run('npm run build', CLIENT)

  console.log('== 2/5: install production server dependencies ==')
  run('npm ci --omit=dev', SERVER)

  console.log('== 3/5: assemble app folder ==')
  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(APP_OUT, { recursive: true })
  copyDir(SERVER, APP_OUT, { exclude: ['.git', '.env', '.gitignore', '.DS_Store'] })
  fs.writeFileSync(path.join(APP_OUT, '.env'), `MONGODB_URI=${MONGODB_URI}\nJWT_SECRET=${JWT_SECRET}\nPORT=${PORT}\n`)

  console.log('== 4/5: bundle portable Windows Node runtime ==')
  const { version, url } = await latestLtsWindowsZip()
  console.log(`> using Node.js ${version} (latest LTS)`)
  const zipPath = path.join(OUT, 'node.zip')
  await downloadFile(url, zipPath)
  fs.mkdirSync(NODE_OUT, { recursive: true })
  extractZip(zipPath, NODE_OUT)
  flattenSingleSubdir(NODE_OUT)
  fs.rmSync(zipPath)

  console.log('== 5/5: write launcher ==')
  fs.writeFileSync(path.join(OUT, 'start.bat'), START_BAT)

  console.log(`\nDone. Package assembled at: ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
