import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithRedirect, 
  getRedirectResult, 
  signOut,
  setPersistence,
  browserLocalPersistence,
  UserCredential,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
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

export const db = firestoreDb;
export const auth = getAuth(app);

// 認証の永続化を IndexedDB / LocalStorage に明示的に設定
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
 * Google ログインを開始（リダイレクト方式）
 */
export const signInWithGoogle = async (forceConsent = false): Promise<void> => {
  if (forceConsent) {
    googleProvider.setCustomParameters({ prompt: 'consent select_account' });
  } else {
    googleProvider.setCustomParameters({ prompt: 'select_account' });
  }
  await signInWithRedirect(auth, googleProvider);
};

/**
 * メールアドレス＆パスワードで新規アカウント登録
 */
export const signUpWithEmail = (email: string, pass: string): Promise<UserCredential> => {
  return createUserWithEmailAndPassword(auth, email, pass);
};

/**
 * メールアドレス＆パスワードでログイン
 */
export const signInWithEmail = (email: string, pass: string): Promise<UserCredential> => {
  return signInWithEmailAndPassword(auth, email, pass);
};

/**
 * リダイレクト後にアプリに戻ってきた際、ログイン結果を取得
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

  if (code === 'auth/email-already-in-use') {
    return {
      code,
      title: '登録済みのメールアドレスです',
      message: 'このメールアドレスは既に登録されています。',
      suggestion: '「ログイン」タブに切り替えてログインをお試しください。'
    };
  }

  if (code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
    return {
      code,
      title: 'ログイン失敗',
      message: 'メールアドレスまたはパスワードが正しくありません。',
      suggestion: '入力内容を再度ご確認のうえお試しください。'
    };
  }

  if (code === 'auth/weak-password') {
    return {
      code,
      title: 'パスワードが短すぎます',
      message: 'パスワードは6文字以上で設定してください。',
      suggestion: '6文字以上の英数字や記号を組み合わせたパスワードを入力してください。'
    };
  }

  return {
    code,
    title: `認証エラー (${code})`,
    message: rawMessage,
    suggestion: 'ネットワーク接続や入力内容をご確認ください。'
  };
}
