/** Semantic overlay layers shared by portals and CSS. */
export const OVERLAY_LAYERS = Object.freeze({
  drawer: 300,
  popover: 400,
  tooltip: 500,
  modal: 600,
  toast: 700,
})

export function overlayLayerVar(layer) {
  return `var(--vc-z-${Object.hasOwn(OVERLAY_LAYERS, layer) ? layer : 'popover'})`
}