import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  setDoc,
  query,
  where,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import type { QueueNumber, QueueState } from "./types";

const QUEUE_NUMBERS_COLLECTION = "queue_numbers";
const QUEUE_STATE_COLLECTION = "queue_state";

function timestampToDate(timestamp: any): Date {
  if (!timestamp) return new Date();
  if (timestamp.toDate) return timestamp.toDate();
  return new Date(timestamp);
}

export async function addNumberToQueue(number: number): Promise<QueueNumber> {
  const docRef = await addDoc(collection(db, QUEUE_NUMBERS_COLLECTION), {
    number,
    status: "waiting",
    assistantId: null,
    assistantName: null,
    createdAt: Timestamp.now(),
    calledAt: null,
    completedAt: null,
  });

  const docSnap = await getDoc(docRef);
  const data = docSnap.data();

  const currentState = await getQueueState();

  if (
    !currentState ||
    (currentState.currentNumber === null && currentState.nextNumber === null)
  ) {
    const stateRef = doc(db, QUEUE_STATE_COLLECTION, "current");
    await setDoc(
      stateRef,
      {
        currentNumber: null,
        nextNumber: number,
        currentAssistantId: null,
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
  }

  return {
    id: docSnap.id,
    number: data!.number,
    status: data!.status,
    assistantId: data!.assistantId,
    assistantName: data!.assistantName,
    createdAt: timestampToDate(data!.createdAt),
    calledAt: data!.calledAt ? timestampToDate(data!.calledAt) : null,
    completedAt: data!.completedAt ? timestampToDate(data!.completedAt) : null,
  };
}

export async function getQueueState(): Promise<QueueState | null> {
  const docRef = doc(db, QUEUE_STATE_COLLECTION, "current");
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    await setDoc(docRef, {
      currentNumber: null,
      nextNumber: null,
      currentAssistantId: null,
      updatedAt: Timestamp.now(),
    });

    return {
      id: "current",
      currentNumber: null,
      nextNumber: null,
      currentAssistantId: null,
      updatedAt: new Date(),
    };
  }

  const data = docSnap.data();
  return {
    id: docSnap.id,
    currentNumber: data.currentNumber,
    nextNumber: data.nextNumber,
    currentAssistantId: data.currentAssistantId || null,
    updatedAt: timestampToDate(data.updatedAt),
  };
}

export async function getNextWaitingNumber(): Promise<QueueNumber | null> {
  const querySnapshot = await getDocs(collection(db, QUEUE_NUMBERS_COLLECTION));

  const waitingNumbers = querySnapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        number: data.number,
        status: data.status,
        assistantId: data.assistantId || null,
        assistantName: data.assistantName || null,
        createdAt: timestampToDate(data.createdAt),
        calledAt: data.calledAt ? timestampToDate(data.calledAt) : null,
        completedAt: data.completedAt
          ? timestampToDate(data.completedAt)
          : null,
      };
    })
    .filter((num) => num.status === "waiting")
    .sort((a, b) => a.number - b.number);

  return waitingNumbers.length > 0 ? waitingNumbers[0] : null;
}

export async function callNextNumber(
  assistantId?: string,
  assistantName?: string,
): Promise<QueueNumber | null> {
  // 1. NETTOYAGE SYSTÉMATIQUE : On cherche TOUT ticket qui a le statut 'current' pour le clôturer
  const qCurrent = query(
    collection(db, QUEUE_NUMBERS_COLLECTION),
    where("status", "==", "current"),
  );
  const queryCurrentSnapshot = await getDocs(qCurrent);

  if (!queryCurrentSnapshot.empty) {
    // On utilise Promise.all pour s'assurer que tous les anciens tickets 'current' passent en 'completed'
    const completionPromises = queryCurrentSnapshot.docs.map((docToComplete) =>
      updateDoc(doc(db, QUEUE_NUMBERS_COLLECTION, docToComplete.id), {
        status: "completed",
        completedAt: Timestamp.now(),
      }),
    );
    await Promise.all(completionPromises);
  }

  // 2. On récupère le prochain numéro en attente
  let nextInQueue = await getNextWaitingNumber();

  if (!nextInQueue) {
    const stateRef = doc(db, QUEUE_STATE_COLLECTION, "current");
    await setDoc(
      stateRef,
      {
        currentNumber: null,
        nextNumber: null,
        currentAssistantId: null,
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
    return null;
  }

  // 3. On passe le nouveau ticket au statut 'current'
  await updateDoc(doc(db, QUEUE_NUMBERS_COLLECTION, nextInQueue.id), {
    status: "current",
    assistantId: assistantId || null,
    assistantName: assistantName || null,
    calledAt: Timestamp.now(),
  });

  // 4. Gestion et anticipation du ticket suivant (Next)
  const allNumbers = await getDocs(collection(db, QUEUE_NUMBERS_COLLECTION));
  const waitingNumbers = allNumbers.docs
    .map((docItem) => {
      const data = docItem.data();
      return {
        id: docItem.id,
        number: data.number as number,
        status: data.status as string,
      };
    })
    .filter((num) => num.status === "waiting")
    .sort((a, b) => a.number - b.number);

  let secondNext: number;

  if (waitingNumbers.length > 0) {
    secondNext = waitingNumbers[0].number;
  } else {
    secondNext = nextInQueue.number + 1;
    // On génère le ticket suivant en arrière-plan sans bloquer
    await addDoc(collection(db, QUEUE_NUMBERS_COLLECTION), {
      number: secondNext,
      status: "waiting",
      assistantId: null,
      assistantName: null,
      createdAt: Timestamp.now(),
      calledAt: null,
      completedAt: null,
    });
  }

  // 5. Mise à jour de l'état global unifié
  const stateRef = doc(db, QUEUE_STATE_COLLECTION, "current");
  await setDoc(
    stateRef,
    {
      currentNumber: nextInQueue.number,
      nextNumber: secondNext,
      currentAssistantId: assistantId || null,
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  );

  return {
    ...nextInQueue,
    status: "current",
    assistantId: assistantId || null,
    assistantName: assistantName || null,
    calledAt: new Date(),
  };
}

export async function getAllQueueNumbers(): Promise<QueueNumber[]> {
  const querySnapshot = await getDocs(collection(db, QUEUE_NUMBERS_COLLECTION));

  return querySnapshot.docs
    .map((docData) => {
      const data = docData.data();
      return {
        id: docData.id,
        number: data.number,
        status: data.status,
        assistantId: data.assistantId || null,
        assistantName: data.assistantName || null,
        createdAt: timestampToDate(data.createdAt),
        calledAt: data.calledAt ? timestampToDate(data.calledAt) : null,
        completedAt: data.completedAt
          ? timestampToDate(data.completedAt)
          : null,
      };
    })
    .sort((a, b) => a.number - b.number);
}

export async function deleteQueueNumber(id: string): Promise<void> {
  await deleteDoc(doc(db, QUEUE_NUMBERS_COLLECTION, id));
}

export async function completeCurrentNumber(): Promise<void> {
  const q = query(
    collection(db, QUEUE_NUMBERS_COLLECTION),
    where("status", "==", "current"),
  );
  const querySnapshot = await getDocs(q);

  if (!querySnapshot.empty) {
    const docToComplete = querySnapshot.docs[0];
    await updateDoc(doc(db, QUEUE_NUMBERS_COLLECTION, docToComplete.id), {
      status: "completed",
      completedAt: Timestamp.now(),
    });
  }

  const nextInQueue = await getNextWaitingNumber();

  const stateRef = doc(db, QUEUE_STATE_COLLECTION, "current");
  await setDoc(
    stateRef,
    {
      currentNumber: null,
      nextNumber: nextInQueue?.number || null,
      currentAssistantId: null,
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  );
}

export async function resetQueue(): Promise<void> {
  const querySnapshot = await getDocs(collection(db, QUEUE_NUMBERS_COLLECTION));

  const batch = writeBatch(db);
  querySnapshot.docs.forEach((docData) => {
    batch.delete(docData.ref);
  });
  await batch.commit();

  const stateRef = doc(db, QUEUE_STATE_COLLECTION, "current");
  await setDoc(
    stateRef,
    {
      currentNumber: null,
      nextNumber: null,
      currentAssistantId: null,
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  );
}
