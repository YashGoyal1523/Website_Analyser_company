#!/usr/bin/env node
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CLIENT = path.join(ROOT, 'client')
const SERVER = path.join(ROOT, 'server')
const OUT = path.join(ROOT, 'dist-package-mac')
const APP_NAME = 'WebsiteAnalyzer'
const APP_BUNDLE = path.join(OUT, `${APP_NAME}.app`)
const CONTENTS = path.join(APP_BUNDLE, 'Contents')
const MACOS_DIR = path.join(CONTENTS, 'MacOS')
const RESOURCES = path.join(CONTENTS, 'Resources')
const APP_OUT = path.join(RESOURCES, 'app')
const NODE_OUT = path.join(RESOURCES, 'node')

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
    if (entry.isDirectory()) copyDir(s, d, { exclude })
    else fs.copyFileSync(s, d)
  }
}

// GitHub's macos-latest runner is Apple Silicon, so process.arch here is 'arm64' —
// but this also lets the script produce an x64 build correctly if ever run on an
// Intel runner/machine, rather than hardcoding one architecture.
function macArch() {
  return process.arch === 'arm64' ? 'arm64' : 'x64'
}

async function latestLtsMacTarball() {
  const res = await fetch('https://nodejs.org/dist/index.json')
  if (!res.ok) throw new Error(`Failed to fetch Node.js release index: ${res.status}`)
  const versions = await res.json()
  const lts = versions.find((v) => v.lts)
  if (!lts) throw new Error('Could not find a Node.js LTS release in the index')
  const arch = macArch()
  return { version: lts.version, arch, url: `https://nodejs.org/dist/${lts.version}/node-${lts.version}-darwin-${arch}.tar.gz` }
}

async function downloadFile(url, dest) {
  console.log(`> downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`)
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}

function extractTarGz(tarPath, destDir) {
  console.log(`> extracting ${tarPath}`)
  fs.mkdirSync(destDir, { recursive: true })
  run(`tar -xzf "${tarPath}" -C "${destDir}"`, ROOT)
}

// The official Node.js tarball has everything nested one level down inside
// "node-vX.Y.Z-darwin-<arch>/" - flatten that so bin/node lands directly in destDir.
function flattenSingleSubdir(destDir) {
  const entries = fs.readdirSync(destDir, { withFileTypes: true })
  if (entries.length !== 1 || !entries[0].isDirectory()) return
  const inner = path.join(destDir, entries[0].name)
  for (const entry of fs.readdirSync(inner, { withFileTypes: true })) {
    fs.renameSync(path.join(inner, entry.name), path.join(destDir, entry.name))
  }
  fs.rmdirSync(inner)
}

// The launcher `open`s the browser itself (server.js's own auto-open is win32-only —
// see the `darwin` branch added there) and always cd's into the bundle's own Resources
// first, since a double-clicked .app's cwd is unpredictable otherwise.
const LAUNCHER_SH = [
  '#!/bin/bash',
  'DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
  'cd "$DIR/../Resources/app"',
  '"$DIR/../Resources/node/bin/node" server.js',
].join('\n') + '\n'

function infoPlist(version) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${APP_NAME}</string>
  <key>CFBundleDisplayName</key><string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key><string>com.websiteanalyzer.app</string>
  <key>CFBundleVersion</key><string>${version}</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundleExecutable</key><string>${APP_NAME}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
`
}

async function main() {
  const { MONGODB_URI, JWT_SECRET, PORT = '4000', APP_VERSION = '1.0.0' } = process.env
  if (!MONGODB_URI || !JWT_SECRET) {
    throw new Error('MONGODB_URI and JWT_SECRET must be set in the environment before packaging (in CI these come from repo secrets).')
  }

  console.log('== 1/5: build client (outputs straight into server/public via client/vite.config.js) ==')
  run('npm ci', CLIENT)
  run('npm run build', CLIENT)

  console.log('== 2/5: install production server dependencies ==')
  run('npm ci --omit=dev', SERVER)

  console.log('== 3/5: assemble .app bundle ==')
  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(MACOS_DIR, { recursive: true })
  copyDir(SERVER, APP_OUT, { exclude: ['.git', '.env', '.gitignore', '.DS_Store'] })
  fs.writeFileSync(path.join(APP_OUT, '.env'), `MONGODB_URI=${MONGODB_URI}\nJWT_SECRET=${JWT_SECRET}\nPORT=${PORT}\n`)
  fs.writeFileSync(path.join(CONTENTS, 'Info.plist'), infoPlist(APP_VERSION))
  fs.writeFileSync(path.join(MACOS_DIR, APP_NAME), LAUNCHER_SH)
  fs.chmodSync(path.join(MACOS_DIR, APP_NAME), 0o755)

  console.log('== 4/5: bundle portable macOS Node runtime ==')
  const { version, arch, url } = await latestLtsMacTarball()
  console.log(`> using Node.js ${version} (latest LTS, darwin-${arch})`)
  const tarPath = path.join(OUT, 'node.tar.gz')
  await downloadFile(url, tarPath)
  extractTarGz(tarPath, NODE_OUT)
  flattenSingleSubdir(NODE_OUT)
  fs.rmSync(tarPath)

  console.log('== 5/5: build .dmg ==')
  const stagingDir = path.join(ROOT, 'dist-package-mac-staging')
  fs.rmSync(stagingDir, { recursive: true, force: true })
  fs.mkdirSync(stagingDir, { recursive: true })
  fs.cpSync(APP_BUNDLE, path.join(stagingDir, `${APP_NAME}.app`), { recursive: true })
  fs.symlinkSync('/Applications', path.join(stagingDir, 'Applications'))

  const installerOutDir = path.join(ROOT, 'installer-output')
  fs.mkdirSync(installerOutDir, { recursive: true })
  const dmgPath = path.join(installerOutDir, `${APP_NAME}Setup.dmg`)
  fs.rmSync(dmgPath, { force: true })
  run(`hdiutil create -volname "${APP_NAME}" -srcfolder "${stagingDir}" -ov -format UDZO "${dmgPath}"`, ROOT)
  fs.rmSync(stagingDir, { recursive: true, force: true })

  console.log(`\nDone. Installer at: ${dmgPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
