import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore, terminate, clearIndexedDbPersistence } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    experimentalForceLongPolling: true // ★Sorbonne等でWebSocketがブロックされるのを回避（通常のHTTPS通信を使用）
  }, firebaseConfig.firestoreDatabaseId);
} catch (e) {
  firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export const db = firestoreDb; // CRITICAL: The app will break without this line
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const clearFirestoreCache = async () => {
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
    // Note: The app will need to reload or re-initialize db after this
    return true;
  } catch (err) {
    console.error("Failed to clear Firestore cache:", err);
    return false;
  }
};

export const signIn = async (forceConsent = false) => {
  if (forceConsent) {
    googleProvider.setCustomParameters({ prompt: 'consent select_account' });
  } else {
    googleProvider.setCustomParameters({});
  }
  const result = await signInWithPopup(auth, googleProvider);
  return {
    user: result.user,
    credential: GoogleAuthProvider.credentialFromResult(result)
  };
};

// ★学内Wi-Fi等でGoogleポップアップが開けない場合のメール/パスワード機能
export const signInWithEmail = async (email: string, pass: string) => {
  return await signInWithEmailAndPassword(auth, email, pass);
};

export const signUpWithEmail = async (email: string, pass: string) => {
  return await createUserWithEmailAndPassword(auth, email, pass);
};

// ★既存のGoogleアカウントにパスワードを連携（同じデータを共有するため）
export const linkEmailPasswordToAccount = async (pass: string) => {
  if (!auth.currentUser || !auth.currentUser.email) {
    throw new Error("ログイン中のユーザーが存在しないか、メールアドレスを取得できません。");
  }
  const credential = EmailAuthProvider.credential(auth.currentUser.email, pass);
  return await linkWithCredential(auth.currentUser, credential);
};


export const logOut = () => signOut(auth);
