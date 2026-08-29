import { useEffect, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import type { QueueNumber, QueueState, User } from "./types";

function mapQueueNumber(id: string, data: any): QueueNumber {
  return {
    id,
    number: data.number,
    block: (data.block as string) || "block a",
    status: data.status,
    assistantId: data.assistantId || null,
    assistantName: data.assistantName || null,
    createdAt: data.createdAt?.toDate() || new Date(),
    calledAt: data.calledAt?.toDate() || null,
    completedAt: data.completedAt?.toDate() || null,
    serviceDurationSeconds: data.serviceDurationSeconds || null,
  };
}

function mapQueueState(id: string, data: any): QueueState {
  return {
    id,
    currentNumber: data.currentNumber ?? null,
    nextNumber: data.nextNumber ?? null,
    currentAssistantId: data.currentAssistantId || null,
    currentNumberA: data.currentNumberA ?? null,
    nextNumberA: data.nextNumberA ?? null,
    currentAssistantIdA: data.currentAssistantIdA || null,
    currentNumberB: data.currentNumberB ?? null,
    nextNumberB: data.nextNumberB ?? null,
    currentAssistantIdB: data.currentAssistantIdB || null,
    updatedAt: data.updatedAt?.toDate() || new Date(),
  };
}

function mapUser(id: string, data: any): User {
  return {
    id,
    email: data.email,
    name: data.name,
    role: data.role,
    block: data.block || (data.startNumber >= 100 ? "block b" : "block a"),
    startNumber: data.startNumber ?? 0,
    color: data.color,
    isActive: data.isActive,
    createdAt: data.createdAt?.toDate() || new Date(),
  };
}

/** Liste temps réel des numéros de la file, triée par numéro. */
export function useQueueNumbers() {
  const [queueNumbers, setQueueNumbers] = useState<QueueNumber[]>([]);

  useEffect(() => {
    return onSnapshot(collection(db, "queue_numbers"), (snapshot) => {
      const numbers = snapshot.docs
        .map((docSnap) => mapQueueNumber(docSnap.id, docSnap.data()))
        .sort((a, b) => a.number - b.number);
      setQueueNumbers(numbers);
    });
  }, []);

  return queueNumbers;
}

/** État courant de la file (numéro en cours / suivant, par bloc) en temps réel. */
export function useQueueState() {
  const [queueState, setQueueState] = useState<QueueState | null>(null);

  useEffect(() => {
    return onSnapshot(doc(db, "queue_state", "current"), (docSnap) => {
      if (!docSnap.exists()) return;
      setQueueState(mapQueueState(docSnap.id, docSnap.data()));
    });
  }, []);

  return queueState;
}

/** Liste temps réel de tous les utilisateurs (non filtrée par rôle). */
export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    return onSnapshot(collection(db, "users"), (snapshot) => {
      setUsers(snapshot.docs.map((docSnap) => mapUser(docSnap.id, docSnap.data())));
    });
  }, []);

  return users;
}
