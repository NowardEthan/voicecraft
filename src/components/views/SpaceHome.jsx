/**
 * SpaceHome — main-area landing page.
 *   1. No Space selected: personal HomeView (Início / Amigos / …)
 *   2. Space selected: live dashboard (SpaceOverview)
 */
import { spaceTokens } from '../../features/spaces'
import SpaceOverview from './SpaceOverview'
import HomeView from './HomeView'

export default function SpaceHome({
  space,
  members = [],
  spaces = [],
  accountName,
  accountPhoto,
  currentUserId,
  currentUserName,
  homeTab = 'para-voce',
  onSelectRoom,
  onSelectSpace,
  onCreateRoom,
  onCreateSpace,
  onOpenHub,
  onJoinPublic,
  onOpenContinueRoom,
  onOpenSpaceEvents,
  onOpenAccount,
  onOpenNotifTarget,
  onInvite,
  onOpenEvents,
  onEditSpace,
  isCreator,
  canEditSpace = false,
  canManageRooms = false,
  connected,
  optimisticFirstRoom,
}) {
  if (!space) {
    return (
      <HomeView
        spaces={spaces}
        accountName={accountName || currentUserName}
        accountPhoto={accountPhoto}
        homeTab={homeTab}
        onSelectSpace={onSelectSpace}
        onCreateSpace={onCreateSpace}
        onOpenHub={onOpenHub}
        onJoinPublic={onJoinPublic}
        onOpenContinueRoom={onOpenContinueRoom}
        onOpenSpaceEvents={onOpenSpaceEvents}
        onOpenAccount={onOpenAccount}
        onOpenNotifTarget={onOpenNotifTarget}
        connected={connected}
      />
    )
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain bg-canvas" style={spaceTokens(space)}>
      <div className="max-w-6xl mx-auto w-full px-3 sm:px-6 md:px-10 pt-12 sm:pt-6 md:pt-8 pb-6 sm:pb-8">
        <SpaceOverview
          space={space}
          members={members}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          onSelectRoom={onSelectRoom}
          onCreateRoom={onCreateRoom}
          onInvite={onInvite}
          onOpenEvents={onOpenEvents}
          onEditSpace={onEditSpace}
          isCreator={isCreator}
          canEditSpace={canEditSpace}
          canManageRooms={canManageRooms}
          optimisticFirstRoom={optimisticFirstRoom}
        />
      </div>
    </div>
  )
}
