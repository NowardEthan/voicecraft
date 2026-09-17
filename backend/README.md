# Backend (BaaS)

Voice’s server-side surface lives here conceptually:

| Piece | Path | Role |
|-------|------|------|
| Firestore rules | [`../firestore.rules`](../firestore.rules) | Durable Spaces, members, rooms, chat |
| Storage rules | [`../storage.rules`](../storage.rules) | Covers / chat files |
| Realtime Database rules | [`../database.rules.json`](../database.rules.json) | Ephemeral online/offline presence |
| Cloud Functions | `functions/` (future) | Optional Hub listing / aggregation |
| Legacy WS signaling | [`../server/`](../server/) | **Deprecated** — do not start from Electron boot |

The Electron + React app under `src/` and `electron/` is the **frontend client**. It talks to Firebase Auth, Firestore, Storage, and Realtime Database directly.

## Presence

- `vc_presence/{uid}` — global online/offline (`onDisconnect`)
- `vc_space_presence/{spaceId}/{uid}` — presence inside a Space (+ optional `roomId`)

Profiles (name, photo, bio, cover) stay in Firestore `vc_users` / space `members`.

## Setup checklist

1. In Firebase Console → Realtime Database → create DB if missing (project `luna-8787d`).
2. Deploy rules: `firebase deploy --only database` (uses [`database.rules.json`](../database.rules.json)).
3. Optional env: `VITE_FIREBASE_DATABASE_URL=https://luna-8787d-default-rtdb.firebaseio.com`
