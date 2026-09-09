/**
 * One-shot admin setup for the Luna Firebase project.
 * Uses the service account in /keys — never imported by the web app.
 */
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { GoogleAuth } from 'google-auth-library'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const keyPath = join(root, 'keys', 'luna-8787d-firebase-adminsdk-fbsvc-1c93c16638.json')
const key = JSON.parse(readFileSync(keyPath, 'utf8'))
const projectId = key.project_id

const auth = new GoogleAuth({
  keyFile: keyPath,
  scopes: [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/firebase',
    'https://www.googleapis.com/auth/identitytoolkit',
    'https://www.googleapis.com/auth/datastore',
  ],
})

async function patch(url, body) {
  const client = await auth.getClient()
  const { token } = await client.getAccessToken()
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  return { ok: res.ok, status: res.status, json }
}

async function get(url) {
  const client = await auth.getClient()
  const { token } = await client.getAccessToken()
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  return { ok: res.ok, status: res.status, json }
}

async function main() {
  console.log(`Bootstrapping Firebase project ${projectId}…`)

  const configUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config?updateMask=signIn.anonymous.enabled,signIn.email.enabled,signIn.email.passwordRequired`
  const authResult = await patch(configUrl, {
    signIn: {
      anonymous: { enabled: false },
      email: { enabled: true, passwordRequired: true },
    },
  })
  console.log('Email + password Auth:', authResult.status, authResult.ok ? 'ok' : JSON.stringify(authResult.json))

  const googleUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/defaultSupportedIdpConfigs/google.com`
  const googleGet = await get(googleUrl)
  console.log(
    'Google Auth:',
    googleGet.status,
    googleGet.ok ? (googleGet.json.enabled ? 'enabled' : 'disabled') : 'not configured',
  )

  const apps = await get(`https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`)
  console.log('Web apps:', apps.status, apps.ok ? (apps.json.apps || []).map(a => a.appId).join(', ') : JSON.stringify(apps.json))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
