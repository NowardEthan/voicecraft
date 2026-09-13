
import { pathToFileURL } from 'node:url'
const mocks = "C:\\Users\\nowar\\OneDrive\\Documentos\\Codes\\voicecraft\\scripts\\tests\\.mocks"
const subs = {
  'firebase/firestore':                'firebase_firestore.mjs',
  'firebase/auth':                     'firebase_auth.mjs',
  'firebase/storage':                  'firebase_storage.mjs',
  '../firebase/app':                   'firebase_app.mjs',
  '../firebase/covers':                'firebase_covers.mjs',
  '../firebase/chatFiles':             'firebase_chatFiles.mjs',
  '../firebase/presence':              'firebase_presence.mjs',
  '../../features/spaces/model/spaceRoles': 'spaceRoles.mjs',
  '../../features/spaces/model/spaceTypography': 'spaceTypography.mjs',
}
export async function resolve(specifier, context, nextResolve) {
  if (Object.prototype.hasOwnProperty.call(subs, specifier)) {
    return {
      url: pathToFileURL(mocks + '/' + subs[specifier]).href,
      shortCircuit: true,
      format: 'module',
    }
  }
  try {
    return await nextResolve(specifier, context)
  } catch (err) {
    if (err && err.code === 'ERR_MODULE_NOT_FOUND') {
      try {
        return await nextResolve(specifier + '.js', context)
      } catch {}
    }
    throw err
  }
}
