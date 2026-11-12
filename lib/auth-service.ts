import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from "firebase/auth";
import {
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  updateDoc,
  Timestamp,
  getFirestore,
} from "firebase/firestore";
import { initializeApp, getApps, deleteApp, FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import app, { auth, db } from "./firebase";
import type { User, UserRole } from "./types";

const USERS_COLLECTION = "users";
const SECONDARY_APP_NAME = "account-creation";

/**
 * Instance Firebase secondaire utilisée uniquement pour créer des comptes.
 * createUserWithEmailAndPassword connecte automatiquement le nouvel utilisateur :
 * sur l'instance principale, cela déconnecterait l'admin en cours.
 */
function getSecondaryApp(): FirebaseApp {
  return (
    getApps().find((a) => a.name === SECONDARY_APP_NAME) ||
    initializeApp(app.options, SECONDARY_APP_NAME)
  );
}

function timestampToDate(timestamp: any): Date {
  if (!timestamp) return new Date();
  if (timestamp.toDate) return timestamp.toDate();
  return new Date(timestamp);
}

/**
 * Crée un compte Assistant avec configuration de la couleur de profil et du numéro d'index initial.
 * L'ordre des arguments correspond exactement à l'appel de votre page d'administration mis à jour.
 */
export async function createAssistantAccount(
  email: string,
  password: string,
  name: string,
  color: any,
  startNumber?: number,
  role: "assistant" | "dispatching" = "assistant",
): Promise<User> {
  const secondaryApp = getSecondaryApp();
  const secondaryAuth = getAuth(secondaryApp);
  const userCredential = await createUserWithEmailAndPassword(
    secondaryAuth,
    email,
    password,
  );
  const userId = userCredential.user.uid;

  // Détermination automatique du bloc en fonction du startNumber ou laissé par défaut
  const block =
    startNumber !== undefined && startNumber >= 100 ? "block b" : "block a";

  const userData = {
    email,
    name,
    role: role as UserRole,
    color,
    block,
    startNumber: startNumber ?? 0,
    isActive: true,
    createdAt: Timestamp.now(),
  };

  try {
    // Écrit avec la session du nouvel utilisateur (règle "self-write" respectée)
    await setDoc(doc(getFirestore(secondaryApp), USERS_COLLECTION, userId), userData);
  } finally {
    await firebaseSignOut(secondaryAuth);
    await deleteApp(secondaryApp).catch(() => {});
  }

  return {
    id: userId,
    ...userData,
    createdAt: new Date(),
  };
}

export interface UserAccountUpdate {
  name?: string;
  role?: "assistant" | "dispatching";
  color?: string;
  block?: "block a" | "block b";
  startNumber?: number;
  isActive?: boolean;
}

/**
 * Met à jour le profil Firestore d'un compte (nom, rôle, bloc, couleur, statut).
 * L'email et le mot de passe Firebase Auth ne peuvent pas être modifiés
 * côté client pour un autre utilisateur.
 */
export async function updateUserAccount(
  userId: string,
  updates: UserAccountUpdate,
): Promise<void> {
  const data: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) data[key] = value;
  }
  if (Object.keys(data).length === 0) return;
  await updateDoc(doc(db, USERS_COLLECTION, userId), data);
}

export async function signIn(
  email: string,
  password: string,
): Promise<FirebaseUser> {
  const userCredential = await signInWithEmailAndPassword(
    auth,
    email,
    password,
  );
  return userCredential.user;
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

export async function getUserProfile(userId: string): Promise<User | null> {
  const docRef = doc(db, USERS_COLLECTION, userId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return null;

  const data = docSnap.data();
  return {
    id: docSnap.id,
    email: data.email,
    name: data.name,
    role: data.role,
    block: data.block,
    startNumber: data.startNumber,
    color: data.color,
    isActive: data.isActive,
    createdAt: timestampToDate(data.createdAt),
  };
}

export async function deleteAssistant(userId: string): Promise<void> {
  await deleteDoc(doc(db, USERS_COLLECTION, userId));
}

export function onAuthChange(callback: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export async function createAdminAccount(
  email: string,
  password: string,
  name: string,
): Promise<User> {
  const userCredential = await createUserWithEmailAndPassword(
    auth,
    email,
    password,
  );
  const userId = userCredential.user.uid;

  const userData = {
    email,
    name,
    role: "admin" as UserRole,
    isActive: true,
    createdAt: Timestamp.now(),
  };

  await setDoc(doc(db, USERS_COLLECTION, userId), userData);

  return {
    id: userId,
    ...userData,
    createdAt: new Date(),
  };
}
