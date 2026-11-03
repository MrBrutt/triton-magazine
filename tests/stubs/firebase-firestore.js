// Заглушка firebase-firestore.js: записи из админки складываются в window.__fsWrites и никуда не уходят.
const log = (op, ...args) => { (window.__fsWrites ||= []).push([op, ...args]); };
export function getFirestore(app) { return { app }; }
export function collection(db, ...path) { return { path: path.join('/') }; }
export function doc(db, ...path) { return { path: path.join('/') }; }
export function query(ref) { return ref; }
export function orderBy() { return null; }
export async function addDoc(ref, data) { log('add', ref.path, data); return { id: 'new-doc' }; }
export async function updateDoc(ref, data) { log('update', ref.path, data); }
export async function setDoc(ref, data) { log('set', ref.path, data); }
export async function deleteDoc(ref) { log('delete', ref.path); }
// Данные «базы» тест кладёт в window.__fsIssues и window.__fsAnnouncement (см. tests/fixtures.js).
export async function getDoc(ref) {
  const a = ref.path === 'settings/announcement' ? window.__fsAnnouncement : null;
  return { exists: () => !!a, data: () => (a ? structuredClone(a) : undefined) };
}
export async function getDocs() {
  return { docs: (window.__fsIssues || []).map(({ id, ...data }) => ({ id, data: () => structuredClone(data) })) };
}
export const getDocsFromServer = getDocs;
