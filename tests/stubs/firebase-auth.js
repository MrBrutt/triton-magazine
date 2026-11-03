// Заглушка firebase-auth.js. Пускает только editor@example.com / secret.
const listeners = new Set();
let current = null;
const emit = () => listeners.forEach((cb) => cb(current));
const fail = (code) => Object.assign(new Error(code), { code });
export function getAuth(app) { return { app, get currentUser() { return current; } }; }
export function onAuthStateChanged(auth, cb) {
  listeners.add(cb);
  setTimeout(() => cb(current), 0);
  return () => listeners.delete(cb);
}
export async function signInWithEmailAndPassword(auth, email, password) {
  (window.__authCalls ||= []).push(email);
  if (email !== 'editor@example.com' || password !== 'secret') throw fail('auth/invalid-credential');
  current = { uid: 'test-editor', email };
  emit();
  return { user: current };
}
export async function sendPasswordResetEmail(auth, email) { (window.__authCalls ||= []).push('reset:' + email); }
export async function signOut() { current = null; emit(); }
