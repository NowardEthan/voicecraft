
export const doc = () => ({})
export const collection = () => ({})
export const getDoc = () => Promise.resolve({ exists: () => false, data: () => ({}) })
export const getDocs = () => Promise.resolve({ docs: [] })
export const setDoc = () => Promise.resolve()
export const updateDoc = () => Promise.resolve()
export const deleteDoc = () => Promise.resolve()
export const addDoc = () => Promise.resolve({ id: 'fake' })
export const onSnapshot = () => () => {}
export const writeBatch = () => ({ delete() {}, update() {}, commit: () => Promise.resolve() })
export const query = (...a) => a
export const where = (...a) => a
export const orderBy = (...a) => a
export const limit = (n) => n
export const startAfter = (...a) => a
export const serverTimestamp = () => Date.now()
export const arrayUnion = (...a) => a
export const arrayRemove = (...a) => a
export const deleteField = () => ({})
