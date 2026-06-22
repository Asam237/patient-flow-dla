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

/**
 * Convertit un nombre entier en format lettre (ex: 0 -> "A00", 99 -> "A99", 100 -> "B00")
 */
export function formatNumberToCode(num: number): string {
  if (num < 0 || isNaN(num)) return "A00";

  const letterIndex = Math.floor(num / 100); // 0 pour A, 1 pour B, etc.
  const remainder = num % 100; // Reste entre 00 et 99

  const letter = String.fromCharCode(65 + letterIndex); // 65 = 'A'
  return `${letter}${remainder.toString().padStart(2, "0")}`;
}

/**
 * Ajoute un numéro à la queue pour un bloc spécifique
 */
export async function addNumberToQueue(
  number: number,
  block?: "block a" | "block b",
): Promise<QueueNumber> {
  const docRef = await addDoc(collection(db, QUEUE_NUMBERS_COLLECTION), {
    number,
    block: block?.toLowerCase(),
    status: "waiting",
    assistantId: null,
    assistantName: null,
    createdAt: Timestamp.now(),
    calledAt: null,
    completedAt: null,
  });

  const docSnap = await getDoc(docRef);
  const data = docSnap.data()!;

  const stateRef = doc(db, QUEUE_STATE_COLLECTION, "current");
  const stateSnap = await getDoc(stateRef);
  const stateData = stateSnap.exists() ? stateSnap.data() : {};

  const blockKey = block?.toLowerCase() === "block a" ? "A" : "B";
  const currentNextKey = `nextNumber${blockKey}`;
  const currentCurrentKey = `currentNumber${blockKey}`;

  if (
    stateData[currentNextKey] == null &&
    stateData[currentCurrentKey] == null
  ) {
    await setDoc(
      stateRef,
      { [currentNextKey]: number, updatedAt: Timestamp.now() },
      { merge: true },
    );
  }

  return {
    id: docSnap.id,
    number: data.number,
    status: data.status,
    assistantId: data.assistantId,
    assistantName: data.assistantName,
    createdAt: timestampToDate(data.createdAt),
    calledAt: data.calledAt ? timestampToDate(data.calledAt) : null,
    completedAt: data.completedAt ? timestampToDate(data.completedAt) : null,
  };
}

export async function getQueueState(): Promise<QueueState | null> {
  const docRef = doc(db, QUEUE_STATE_COLLECTION, "current");
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    const initialPayload = {
      currentNumberA: null,
      nextNumberA: null,
      currentAssistantIdA: null,
      currentNumberB: null,
      nextNumberB: null,
      currentAssistantIdB: null,
      currentNumber: null,
      nextNumber: null,
      currentAssistantId: null,
      updatedAt: Timestamp.now(),
    };
    await setDoc(docRef, initialPayload);
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
    currentNumber: data.currentNumber ?? null,
    nextNumber: data.nextNumber ?? null,
    currentAssistantId: data.currentAssistantId ?? null,
    updatedAt: timestampToDate(data.updatedAt),
  };
}

/**
 * Retourne le prochain ticket en attente pour un bloc donné
 */
export async function getNextWaitingNumber(
  block?: string,
): Promise<QueueNumber | null> {
  const querySnapshot = await getDocs(collection(db, QUEUE_NUMBERS_COLLECTION));
  const blockNorm = block?.toLowerCase() ?? "";

  const waitingNumbers = querySnapshot.docs
    .map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        number: Number(data.number),
        block: (data.block as string) || "",
        status: data.status as QueueNumber["status"],
        assistantId: data.assistantId || null,
        assistantName: data.assistantName || null,
        createdAt: timestampToDate(data.createdAt),
        calledAt: data.calledAt ? timestampToDate(data.calledAt) : null,
        completedAt: data.completedAt
          ? timestampToDate(data.completedAt)
          : null,
      };
    })
    .filter((num) => {
      if (num.status !== "waiting") return false;
      if (blockNorm) return num.block.toLowerCase() === blockNorm;
      return true;
    })
    .sort((a, b) => a.number - b.number);

  return waitingNumbers.length > 0 ? waitingNumbers[0] : null;
}

/**
 * Appelle et incrémente le numéro suivant de manière isolée par bloc
 */
export async function callNextNumber(
  assistantId: string,
  assistantName?: string,
  ticketId?: string,
  block?: string,
): Promise<QueueNumber | null> {
  const blockNorm = block?.toLowerCase() ?? "";
  const blockKey =
    blockNorm === "block a" ? "A" : blockNorm === "block b" ? "B" : null;

  // 1. Clôturer le ticket "current" actif de ce bloc précis
  const qCurrent = query(
    collection(db, QUEUE_NUMBERS_COLLECTION),
    where("status", "==", "current"),
  );
  const queryCurrentSnapshot = await getDocs(qCurrent);

  if (!queryCurrentSnapshot.empty) {
    const completionPromises = queryCurrentSnapshot.docs
      .filter((d) => {
        if (!blockNorm) return true;
        return ((d.data().block as string) || "").toLowerCase() === blockNorm;
      })
      .map((docToComplete) =>
        updateDoc(doc(db, QUEUE_NUMBERS_COLLECTION, docToComplete.id), {
          status: "completed",
          completedAt: Timestamp.now(),
        }),
      );
    await Promise.all(completionPromises);
  }

  // 2. Récupérer l'historique du bloc cible pour calculer l'incrément réel
  const allNumbersSnapshot = await getDocs(
    collection(db, QUEUE_NUMBERS_COLLECTION),
  );
  const allBlockNumbers = allNumbersSnapshot.docs
    .map((d) => ({
      id: d.id,
      number: Number(d.data().number),
      block: ((d.data().block as string) || "").toLowerCase(),
      status: d.data().status as string,
    }))
    .filter((n) => (blockNorm ? n.block === blockNorm : true));

  let nextInQueue: QueueNumber | null = null;

  if (ticketId) {
    const ticketRef = doc(db, QUEUE_NUMBERS_COLLECTION, ticketId);
    const ticketSnap = await getDoc(ticketRef);
    if (ticketSnap.exists() && ticketSnap.data().status === "waiting") {
      const data = ticketSnap.data();
      nextInQueue = {
        id: ticketSnap.id,
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
    }
  } else {
    const waitingTickets = allBlockNumbers
      .filter((n) => n.status === "waiting")
      .sort((a, b) => a.number - b.number);

    if (waitingTickets.length > 0) {
      const target = waitingTickets[0];
      const docRef = doc(db, QUEUE_NUMBERS_COLLECTION, target.id);
      const docSnap = await getDoc(docRef);
      const data = docSnap.data()!;
      nextInQueue = {
        id: docSnap.id,
        number: data.number,
        status: data.status,
        assistantId: data.assistantId,
        assistantName: data.assistantName,
        createdAt: timestampToDate(data.createdAt),
        calledAt: data.calledAt ? timestampToDate(data.calledAt) : null,
        completedAt: data.completedAt
          ? timestampToDate(data.completedAt)
          : null,
      };
    }
  }

  // 🔄 INCÉMENTATION SÉCURISÉE SI LA FILE EST VIDE
  if (!nextInQueue) {
    let nextGeneratedNumber = 0;

    const validNumbers = allBlockNumbers
      .map((n) => n.number)
      .filter((n) => !isNaN(n));
    if (validNumbers.length > 0) {
      nextGeneratedNumber = Math.max(...validNumbers) + 1; // S'implémente continuellement (+1)
    } else if (assistantId) {
      const userSnap = await getDoc(doc(db, "users", assistantId));
      if (userSnap.exists()) {
        nextGeneratedNumber = Number(userSnap.data().startNumber) || 0;
      }
    }

    const newDocRef = await addDoc(collection(db, QUEUE_NUMBERS_COLLECTION), {
      number: nextGeneratedNumber,
      block: blockNorm,
      status: "current",
      assistantId: assistantId || null,
      assistantName: assistantName || null,
      createdAt: Timestamp.now(),
      calledAt: Timestamp.now(),
      completedAt: null,
    });

    const newDocSnap = await getDoc(newDocRef);
    const newData = newDocSnap.data()!;

    nextInQueue = {
      id: newDocSnap.id,
      number: newData.number,
      status: "current",
      assistantId: newData.assistantId,
      assistantName: newData.assistantName,
      createdAt: timestampToDate(newData.createdAt),
      calledAt: timestampToDate(newData.calledAt),
      completedAt: null,
    };
  } else {
    await updateDoc(doc(db, QUEUE_NUMBERS_COLLECTION, nextInQueue.id), {
      status: "current",
      assistantId: assistantId || null,
      assistantName: assistantName || null,
      calledAt: Timestamp.now(),
    });
    nextInQueue.status = "current";
    nextInQueue.assistantId = assistantId || null;
    nextInQueue.assistantName = assistantName || null;
    nextInQueue.calledAt = new Date();
  }

  // 4. Déterminer le prochain ticket virtuel "En attente"
  const updatedNumbersSnapshot = await getDocs(
    collection(db, QUEUE_NUMBERS_COLLECTION),
  );
  const updatedBlockNumbers = updatedNumbersSnapshot.docs
    .map((d) => ({
      number: Number(d.data().number),
      block: ((d.data().block as string) || "").toLowerCase(),
      status: d.data().status as string,
    }))
    .filter((n) => (blockNorm ? n.block === blockNorm : true));

  const realNextWaiting =
    updatedBlockNumbers
      .filter((n) => n.status === "waiting")
      .sort((a, b) => a.number - b.number)[0] ?? null;

  let nextWaitingNumberValue = realNextWaiting
    ? realNextWaiting.number
    : nextInQueue.number + 1;

  // 🔁 La file ne doit jamais rester vide : si plus aucun ticket n'est en
  // attente pour ce bloc après cet appel, on émet immédiatement le suivant.
  if (!realNextWaiting) {
    await addDoc(collection(db, QUEUE_NUMBERS_COLLECTION), {
      number: nextWaitingNumberValue,
      block: blockNorm,
      status: "waiting",
      assistantId: null,
      assistantName: null,
      createdAt: Timestamp.now(),
      calledAt: null,
      completedAt: null,
    });
  }

  // 5. Mise à jour globale et par bloc de queue_state
  const stateRef = doc(db, QUEUE_STATE_COLLECTION, "current");
  const updatePayload: Record<string, any> = {
    updatedAt: Timestamp.now(),
    currentNumber: nextInQueue.number,
    nextNumber: nextWaitingNumberValue,
    currentAssistantId: assistantId || null,
    // FIX: Add global calledAt timestamp for single-queue pages like l_page.tsx
    calledAt: Timestamp.now(),
  };

  if (blockKey) {
    updatePayload[`currentNumber${blockKey}`] = nextInQueue.number;
    updatePayload[`nextNumber${blockKey}`] = nextWaitingNumberValue;
    updatePayload[`currentAssistantId${blockKey}`] = assistantId || null;
    // ⏱️ Horodatage dédié à CET appel précis (même si le numéro est identique
    // à l'appel précédent, ex: rappel manuel) afin que l'affichage puisse
    // détecter et ré-annoncer chaque appel, pas seulement les changements de numéro.
    updatePayload[`calledAt${blockKey}`] = Timestamp.now();
  }

  await setDoc(stateRef, updatePayload, { merge: true });
  return nextInQueue;
}

export async function getAllQueueNumbers(): Promise<QueueNumber[]> {
  const querySnapshot = await getDocs(collection(db, QUEUE_NUMBERS_COLLECTION));
  return querySnapshot.docs
    .map((docData) => {
      const data = docData.data();
      return {
        id: docData.id,
        number: Number(data.number),
        block: data.block,
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

export async function completeCurrentNumber(block?: string): Promise<void> {
  const blockNorm = block?.toLowerCase() ?? "";
  const q = query(
    collection(db, QUEUE_NUMBERS_COLLECTION),
    where("status", "==", "current"),
  );
  const querySnapshot = await getDocs(q);

  if (!querySnapshot.empty) {
    const docToComplete =
      querySnapshot.docs.find((d) => {
        if (!blockNorm) return true;
        return ((d.data().block as string) || "").toLowerCase() === blockNorm;
      }) ?? querySnapshot.docs[0];

    await updateDoc(doc(db, QUEUE_NUMBERS_COLLECTION, docToComplete.id), {
      status: "completed",
      completedAt: Timestamp.now(),
    });
  }

  const nextInQueue = await getNextWaitingNumber(block);
  const stateRef = doc(db, QUEUE_STATE_COLLECTION, "current");

  const blockKey =
    blockNorm === "block a" ? "A" : blockNorm === "block b" ? "B" : null;
  const updatePayload: Record<string, any> = {
    currentNumber: null,
    nextNumber: nextInQueue?.number || null,
    currentAssistantId: null,
    updatedAt: Timestamp.now(),
  };

  if (blockKey) {
    updatePayload[`currentNumber${blockKey}`] = null;
    updatePayload[`nextNumber${blockKey}`] = nextInQueue?.number || null;
    updatePayload[`currentAssistantId${blockKey}`] = null;
  }

  await setDoc(stateRef, updatePayload, { merge: true });
}

export async function deleteQueueNumber(id: string): Promise<void> {
  await deleteDoc(doc(db, QUEUE_NUMBERS_COLLECTION, id));
}

export async function resetQueue(): Promise<void> {
  const querySnapshot = await getDocs(collection(db, QUEUE_NUMBERS_COLLECTION));
  const batch = writeBatch(db);
  querySnapshot.docs.forEach((docData) => {
    batch.delete(docData.ref);
  });
  await batch.commit();

  const stateRef = doc(db, QUEUE_STATE_COLLECTION, "current");
  await setDoc(stateRef, {
    currentNumber: null,
    nextNumber: null,
    currentAssistantId: null,
    currentNumberA: null,
    nextNumberA: null,
    currentAssistantIdA: null,
    currentNumberB: null,
    nextNumberB: null,
    currentAssistantIdB: null,
    updatedAt: Timestamp.now(),
  });
}
