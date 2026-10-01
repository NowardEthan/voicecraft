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
    <div className="vc-space-page h-full min-h-0 overflow-y-auto overscroll-contain bg-canvas" style={spaceTokens(space)}>
      <div className="vc-space-home-frame max-w-[1440px] mx-auto w-full px-2.5 sm:px-5 lg:px-7 pt-11 sm:pt-4 lg:pt-5 pb-6 sm:pb-8">
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
