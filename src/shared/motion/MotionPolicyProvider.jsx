import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { MOTION_INTENTS } from './tokens.js'
import { normalizePerfTier, resolveMotionPolicy, shouldAnimateIntent } from './policy.js'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const fallbackPolicy = resolveMotionPolicy()
const MotionPolicyContext = createContext(fallbackPolicy)

function readReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(REDUCED_MOTION_QUERY).matches
}

function readVisibility() {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden'
}

function readPerfTier() {
  if (typeof document === 'undefined') return 'mid'
  return normalizePerfTier(document.body?.getAttribute('data-perf-tier'))
}

export function MotionPolicyProvider({ children }) {
  const [reducedMotion, setReducedMotion] = useState(readReducedMotion)
  const [isDocumentVisible, setDocumentVisible] = useState(readVisibility)
  const [perfTier, setPerfTier] = useState(readPerfTier)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const query = window.matchMedia(REDUCED_MOTION_QUERY)
    const update = (event) => setReducedMotion(event.matches)
    setReducedMotion(query.matches)
    query.addEventListener?.('change', update)
    if (!query.addEventListener) query.addListener?.(update)
    return () => {
      query.removeEventListener?.('change', update)
      if (!query.removeEventListener) query.removeListener?.(update)
    }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const update = () => setDocumentVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined' || !document.body || typeof MutationObserver === 'undefined') {
      return undefined
    }
    const update = () => setPerfTier(readPerfTier())
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-perf-tier'] })
    return () => observer.disconnect()
  }, [])

  const policy = useMemo(
    () => resolveMotionPolicy({ reducedMotion, perfTier, visible: isDocumentVisible }),
    [reducedMotion, perfTier, isDocumentVisible],
  )

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const root = document.documentElement
    root.dataset.motionReduced = String(policy.reducedMotion)
    root.dataset.motionPerfTier = policy.perfTier
    root.dataset.documentVisibility = policy.isDocumentVisible ? 'visible' : 'hidden'
    root.dataset.motionDecorative = policy.allowDecorative ? 'on' : 'off'
    root.dataset.motionContinuous = policy.allowContinuous ? 'on' : 'off'
    return () => {
      delete root.dataset.motionReduced
      delete root.dataset.motionPerfTier
      delete root.dataset.documentVisibility
      delete root.dataset.motionDecorative
      delete root.dataset.motionContinuous
    }
  }, [policy])

  return <MotionPolicyContext.Provider value={policy}>{children}</MotionPolicyContext.Provider>
}

export function useMotionPolicy() {
  return useContext(MotionPolicyContext)
}

export function useMotionIntent(intent = MOTION_INTENTS.decorative) {
  const policy = useMotionPolicy()
  return useMemo(() => ({
    ...policy,
    intent,
    enabled: shouldAnimateIntent(policy, intent),
  }), [policy, intent])
}