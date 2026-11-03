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
export async function getDoc(ref) { return { exists: () => false, data: () => undefined }; }
export async function getDocs() { return { docs: [] }; }
export const getDocsFromServer = getDocs;
