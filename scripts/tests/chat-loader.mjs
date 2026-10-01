import { readFile } from 'node:fs/promises'

const mocks = new URL('./.mocks/', import.meta.url)
const substitutions = {
  'firebase/firestore': 'firebase_firestore.mjs',
  'firebase/auth': 'firebase_auth.mjs',
  'firebase/storage': 'firebase_storage.mjs',
  'firebase/functions': 'firebase_functions.mjs',
  '../firebase/app': 'firebase_app.mjs',
  '../firebase/covers': 'firebase_covers.mjs',
  '../firebase/chatFiles': 'firebase_chatFiles.mjs',
  '../firebase/presence': 'firebase_presence.mjs',
  '../../features/spaces/model/spaceRoles': 'spaceRoles.mjs',
  '../../features/spaces/model/spaceTypography': 'spaceTypography.mjs',
}

export async function resolve(specifier, context, nextResolve) {
  const mock = substitutions[specifier]
  if (mock) {
    return {
      url: new URL(mock, mocks).href,
      shortCircuit: true,
      format: 'module',
    }
  }
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.')) {
      return nextResolve(`${specifier}.js`, context)
    }
    throw error
  }
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && /[\\/]src[\\/].*\.js$/.test(new URL(url).pathname)) {
    return { format: 'module', source: await readFile(new URL(url), 'utf8'), shortCircuit: true }
  }
  return nextLoad(url, context)
}

