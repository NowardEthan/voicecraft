export const getFunctions = () => ({})
export const httpsCallable = () => async () => {
  const error = new Error('Functions emulator unavailable in unit mock')
  error.code = 'functions/unavailable'
  throw error
}
