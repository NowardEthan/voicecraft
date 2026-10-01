// Shared — primitives used by 2+ features.
export {
  EASE_OUT,
  EASE_IN_OUT,
  EASE_SPRING,
  EASE_SPRING_SOFT,
  EASE_SPRING_SNAPPY,
  DUR,
} from './motion/presets'
export {
  MOTION_INTENTS, MOTION_DURATION, MOTION_EASING, MOTION_SPRING,
  MOTION_TRANSITION, MOTION_VARIANTS,
} from './motion/tokens'
export { MotionPolicyProvider, useMotionPolicy, useMotionIntent } from './motion/MotionPolicyProvider'
export { resolveMotionPolicy, shouldAnimateIntent } from './motion/policy'

export { ModalShell } from './motion/ModalShell'
export { AnchoredOverlay, TooltipOverlay } from './motion/AnchoredOverlay'
export { OVERLAY_LAYERS, overlayLayerVar } from './motion/layers'
export { resolveOverlayMotion } from './motion/overlayPolicy'
export { ViewTransition, DrawerPresence, TabIndicator, TabPanelSwap, PersistentTabPanel, MeasuredDisclosure } from './motion/Transitions'
export { resolveViewTransition, resolveDrawerTransition, resolveTabTransition, resolveDisclosureTransition } from './motion/transitionPolicy'
export {
  FadeScale, Fade, SlideUp, SlideRight, SlideLeft, Pop,
  IntentMotion, MotionButton, MotionCard, AnimatePresence, motion,
} from './motion/Motion'
export {
  Appear,
  AppearGroup,
  AppearList,
  AppearItem,
  appearItem,
  appearContainer,
  APPEAR_EASE,
} from './motion/Appear'


export { default as EmptyState } from './ui/EmptyState'

export { getLocalIP, getHostname } from './utils/network'
export { flashToast } from './utils/toast'
