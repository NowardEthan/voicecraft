// People feature — public surface.
// Wraps the ProfilePopover component + hook so other features can pull
// them through a single import. The component renders at App-level and
// exposes window.__vcOpenProfile for any avatar click anywhere in the tree.
export { default as ProfilePopover } from './components/ProfilePopover'
export { PersonAvatar } from './components/PersonAvatar'
export { useProfilePopover } from './hooks/useProfilePopover'
export { getLocalMemberStatus, setLocalMemberStatus } from './model/memberStatus'
