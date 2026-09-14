/**
 * profileCache — shared friend/user cosmetics seeded during boot so the
 * first paint after splash already has names/covers/photos (no 1s hydrate gap).
 */

let _profiles = Object.create(null)
let _friendsGraph = null

export function seedProfiles(list = []) {
  for (const p of list || []) {
    if (p?.uid) _profiles[p.uid] = p
  }
}

export function setCachedProfile(uid, profile) {
  if (!uid || !profile) return
  _profiles[uid] = profile
}

export function getCachedProfile(uid) {
  return uid ? (_profiles[uid] || null) : null
}

export function getCachedProfiles() {
  return { ..._profiles }
}

export function seedFriendsGraph(graph) {
  if (!graph || typeof graph !== 'object') return
  _friendsGraph = {
    incoming: graph.incoming || [],
    outgoing: graph.outgoing || [],
    friends: graph.friends || [],
  }
}

export function getCachedFriendsGraph() {
  return _friendsGraph
    ? {
        incoming: _friendsGraph.incoming || [],
        outgoing: _friendsGraph.outgoing || [],
        friends: _friendsGraph.friends || [],
      }
    : null
}
