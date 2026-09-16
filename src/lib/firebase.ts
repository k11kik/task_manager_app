import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithRedirect, 
  getRedirectResult, 
  signOut,
  setPersistence,
  browserLocalPersistence,
  UserCredential
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
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  }, firebaseConfig.firestoreDatabaseId);
} catch (e) {
  firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export const db = firestoreDb; // CRITICAL: The app will break without this line
export const auth = getAuth(app);

// 認証の永続化を IndexedDB / LocalStorage に明示的に設定（リダイレクト復帰時のセッション消失を防止）
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Auth persistence setup failed:", err);
});

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

/**
 * Googleログインを開始します（リダイレクト方式）。
 * ポップアップがブロックされる環境（大学Wi-FiプロキシやSafari）でも通信切断を回避できます。
 */
export const signIn = async (forceConsent = false): Promise<void> => {
  if (forceConsent) {
    googleProvider.setCustomParameters({ prompt: 'consent select_account' });
  } else {
    googleProvider.setCustomParameters({ prompt: 'select_account' });
  }
  // ポップアップ(signInWithPopup)ではなく、画面全体をGoogle認証画面に遷移させる
  await signInWithRedirect(auth, googleProvider);
};

/**
 * リダイレクト後にアプリに戻ってきた際、ログイン結果を取得します。
 * App component の useEffect 等でアプリ起動時に呼び出してください。
 */
export const checkRedirectResult = async (): Promise<UserCredential | null> => {
  try {
    const result = await getRedirectResult(auth);
    return result;
  } catch (error) {
    console.error("Redirect login error:", error);
    throw error;
  }
};

export const logOut = () => signOut(auth);

export interface AuthErrorInfo {
  code: string;
  title: string;
  message: string;
  suggestion: string;
}

export function parseAuthError(err: any): AuthErrorInfo {
  const code = err?.code || 'auth/unknown';
  const rawMessage = err?.message || String(err);

  if (code === 'auth/unauthorized-domain') {
    const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
    return {
      code,
      title: '承認されていないドメインです',
      message: `現在アクセスしているドメイン「${currentHost}」がFirebaseの承認済みドメインに登録されていません。`,
      suggestion: `Firebase Console > Authentication > Settings > 承認済みドメイン に「${currentHost}」を追加してください。`
    };
  }

  if (code === 'auth/popup-blocked') {
    return {
      code,
      title: 'ポップアップがブロックされました',
      message: 'ブラウザのポップアップブロック機能によりログイン画面を開けませんでした。',
      suggestion: 'リダイレクト方式によるログインをお試しいただくか、ブラウザのポップアップ許可を設定してください。'
    };
  }

  return {
    code,
    title: `認証エラー (${code})`,
    message: rawMessage,
    suggestion: 'ネットワーク接続やブラウザの設定をご確認ください。'
  };
}
