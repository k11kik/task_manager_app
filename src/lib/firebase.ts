import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager, 
  getFirestore, 
  terminate, 
  clearIndexedDbPersistence 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    experimentalForceLongPolling: true // 厳格なプロキシ・学内Wi-Fi環境対策 (WebSocket遮断回避)
  }, firebaseConfig.firestoreDatabaseId);
} catch (e) {
  firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export const db = firestoreDb;
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const clearFirestoreCache = async () => {
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
    return true;
  } catch (err) {
    console.error("Failed to clear Firestore cache:", err);
    return false;
  }
};

export const signInWithGoogle = async (forceConsent = false) => {
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

// 既存コードとの互換性用
export const signIn = signInWithGoogle;

// メール/パスワード ログイン (厳格なWi-Fi環境用)
export const signInWithEmail = async (email: string, pass: string) => {
  return await signInWithEmailAndPassword(auth, email, pass);
};

// メール/パスワード 新規アカウント登録
export const signUpWithEmail = async (email: string, pass: string) => {
  return await createUserWithEmailAndPassword(auth, email, pass);
};

export const logOut = () => signOut(auth);
