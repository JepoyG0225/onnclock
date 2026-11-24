// Run from repository root after building the Windows installer:
// node --env-file=.env --env-file=.env.local scripts/publish-employee-desktop.cjs
// Upload immutable artifacts first and the live release feed LAST.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const yaml = require('../desktop-app-employee/node_modules/js-yaml')
const { verifyPublisher } = require('../desktop-app-employee/automatic-updates')

async function main() {
  const root = path.resolve(__dirname, '../desktop-app-employee')
  const manifest = fs.readFileSync(path.join(root, 'dist/latest.yml'))
  const info = yaml.load(manifest.toString())
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
  if (info.version !== version) throw Error('Build version does not match package version')
  const file = info.files.find(f => f.url.endsWith('.exe'))
  if (!file || path.basename(file.url) !== file.url) throw Error('Invalid release artifact')
  const data = fs.readFileSync(path.join(root, 'dist', file.url))
  if (crypto.createHash('sha512').update(data).digest('base64') !== file.sha512 || data.length !== file.size) throw Error('Installer integrity check failed')
  const signatureError = await verifyPublisher([], path.join(root, 'dist', file.url))
  if (signatureError) throw Error(signatureError)
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !key) throw Error('Missing storage credentials')
  async function upload(name, bytes, mutable = false) {
    const object = `employee/windows/${encodeURIComponent(name)}`
    const response = await fetch(`${base}/storage/v1/object/download/${object}`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, apikey: key,
        'Content-Type': name.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream',
        'Cache-Control': mutable ? 'no-cache' : 'max-age=31536000', 'x-upsert': String(mutable) }, body: bytes,
    })
    if (!response.ok) throw Error(`Upload ${name}: HTTP ${response.status}`)
    console.log(`Published ${name} (${bytes.length} bytes)`)
  }
  await upload(file.url, data)
  await upload(`${file.url}.blockmap`, fs.readFileSync(path.join(root, 'dist', `${file.url}.blockmap`)))
  await upload('latest.yml', manifest, true)
  console.log(`Installer: ${base}/storage/v1/object/public/download/employee/windows/${encodeURIComponent(file.url)}`)
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
