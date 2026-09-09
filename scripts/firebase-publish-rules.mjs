/**
 * Publish Firestore + Storage rules via the Rules API.
 * Avoids `firebase deploy`, which needs Service Usage permissions
 * this admin SDK account does not have.
 */
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { GoogleAuth } from 'google-auth-library'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const keyPath = join(root, 'keys', 'luna-8787d-firebase-adminsdk-fbsvc-1c93c16638.json')
const key = JSON.parse(readFileSync(keyPath, 'utf8'))
const projectId = key.project_id
const bucket = 'luna-8787d.firebasestorage.app'

const auth = new GoogleAuth({
  keyFile: keyPath,
  scopes: [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/firebase',
    'https://www.googleapis.com/auth/firebase.readonly',
  ],
})

async function request(method, url, body) {
  const client = await auth.getClient()
  const { token } = await client.getAccessToken()
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  return { ok: res.ok, status: res.status, json }
}

async function publish(releaseId, fileName, content) {
  const created = await request(
    'POST',
    `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`,
    { source: { files: [{ name: fileName, content }] } },
  )
  if (!created.ok) {
    throw new Error(`ruleset ${fileName}: ${created.status} ${JSON.stringify(created.json)}`)
  }
  const rulesetName = created.json.name
  console.log(`ruleset ${fileName}: ${rulesetName}`)
  const releaseName = `projects/${projectId}/releases/${releaseId}`
  const releaseBody = { name: releaseName, rulesetName }
  let released = await request(
    'POST',
    `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases`,
    releaseBody,
  )
  if (released.status === 409 || released.status === 400) {
    released = await request(
      'PATCH',
      `https://firebaserules.googleapis.com/v1/${releaseName}?updateMask=rulesetName`,
      releaseBody,
    )
  }
  if (!released.ok) {
    throw new Error(`release ${releaseId}: ${released.status} ${JSON.stringify(released.json)}`)
  }
  console.log(`ok  ${releaseId}`)
}

async function main() {
  const firestore = readFileSync(join(root, 'firestore.rules'), 'utf8')
  const storage = readFileSync(join(root, 'storage.rules'), 'utf8')
  await publish('cloud.firestore', 'firestore.rules', firestore)
  await publish(`firebase.storage/${bucket}`, 'storage.rules', storage)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
