# scripts/tests

Standalone Node test scripts for VoiceCraft contract validation.

## test_signaling_cache.mjs

Validates the in-memory `_spaceCacheById` Map logic and static-contract
properties of the 5 modified files. Uses a custom ESM loader
(`hook.mjs`) plus fixture mocks under `.mocks/` to import
`src/shared/connection/signalingClient.js` without bundlers or
browsers (Firebase, internal `firebase/*` and `features/spaces/model/*`
modules are stubbed).

Run with:

```
node scripts/tests/test_signaling_cache.mjs
```

Exits 0 on full pass, 1 on any failure.
