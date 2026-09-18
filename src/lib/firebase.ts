import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  linkWithCredential,
  EmailAuthProvider,
  updatePassword,
  updateProfile,
  signOut,
  User
} from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore, terminate, clearIndexedDbPersistence } from 'firebase/firestore';
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

export const signInWithGoogleRedirectMode = async (forceConsent = false) => {
  if (forceConsent) {
    googleProvider.setCustomParameters({ prompt: 'consent select_account' });
  } else {
    googleProvider.setCustomParameters({});
  }
  await signInWithRedirect(auth, googleProvider);
};

export const checkRedirectResult = async () => {
  try {
    const result = await getRedirectResult(auth);
    return result;
  } catch (err) {
    console.error("Redirect auth error:", err);
    throw err;
  }
};

export const signInWithEmail = async (email: string, pass: string) => {
  return await signInWithEmailAndPassword(auth, email.trim(), pass);
};

export const signUpWithEmail = async (email: string, pass: string, displayName?: string) => {
  const result = await createUserWithEmailAndPassword(auth, email.trim(), pass);
  if (displayName && result.user) {
    await updateProfile(result.user, { displayName: displayName.trim() });
  }
  return result;
};

export const sendPasswordReset = async (email: string) => {
  return await sendPasswordResetEmail(auth, email.trim());
};

export const linkEmailPasswordToCurrentUser = async (password: string) => {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error("No authenticated user with an email found.");
  }
  const credential = EmailAuthProvider.credential(user.email, password);
  try {
    return await linkWithCredential(user, credential);
  } catch (err: any) {
    if (err?.code === 'auth/provider-already-linked') {
      await updatePassword(user, password);
      return { user };
    }
    throw err;
  }
};

export const hasPasswordAuth = (user: User | null): boolean => {
  if (!user) return false;
  return user.providerData.some(p => p.providerId === 'password');
};

export const hasGoogleAuth = (user: User | null): boolean => {
  if (!user) return false;
  return user.providerData.some(p => p.providerId === 'google.com');
};

export const logOut = () => signOut(auth);
