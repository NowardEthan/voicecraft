import { useEffect, useMemo, useState } from 'react'
import { subscribeUserTagsMap } from '../model/userTagsStore'

/**
 * Live Map of userId → tags[] for the given member list.
 */
export function useMemberTags(members) {
  const uids = useMemo(
    () => [...new Set((members || []).map((m) => m?.userId).filter(Boolean))],
    [members],
  )
  const key = uids.slice().sort().join('|')
  const [tagsByUser, setTagsByUser] = useState(() => new Map())

  useEffect(() => {
    return subscribeUserTagsMap(uids, setTagsByUser)
    // key captures uid set identity without depending on array ref
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return tagsByUser
}

export function tagsFor(tagsByUser, userId) {
  if (!userId || !tagsByUser) return []
  return tagsByUser.get(userId) || []
}
