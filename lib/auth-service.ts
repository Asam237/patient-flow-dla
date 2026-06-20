import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from "firebase/auth";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  Timestamp,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import type { User, UserRole } from "./types";

const USERS_COLLECTION = "users";

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
  color: string,
  startNumber?: number,
): Promise<User> {
  const userCredential = await createUserWithEmailAndPassword(
    auth,
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
    role: "assistant" as UserRole,
    color,
    block,
    startNumber: startNumber ?? 0,
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

export async function getAllAssistants(): Promise<User[]> {
  const q = query(
    collection(db, USERS_COLLECTION),
    where("role", "==", "assistant"),
  );

  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      email: data.email,
      name: data.name,
      role: data.role,
      block: data.block || (data.startNumber >= 100 ? "block b" : "block a"),
      startNumber: data.startNumber ?? 0,
      color: data.color,
      isActive: data.isActive,
      createdAt: timestampToDate(data.createdAt),
    };
  });
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
