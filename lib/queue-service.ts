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
  runTransaction,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import type { QueueNumber, QueueState } from "./types";

const QUEUE_NUMBERS_COLLECTION = "queue_numbers";
const QUEUE_STATE_COLLECTION = "queue_state";
/** Archive des tickets traités : alimentée par resetQueue(), jamais vidée. */
const QUEUE_HISTORY_COLLECTION = "queue_history";

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

/** Levée quand le ticket visé a été pris par un autre box entre-temps. */
class TicketAlreadyTakenError extends Error {}

/** Nombre max de tickets relus dans la transaction pour calculer le "suivant". */
const NEXT_LOOKAHEAD = 10;

/**
 * Appelle un ticket pour un box (assistant) d'un bloc donné, en FIFO.
 *
 * Plusieurs box d'un même bloc peuvent appeler au même moment. La prise du
 * ticket se fait dans une transaction Firestore qui relit le ticket et
 * vérifie qu'il est toujours "waiting" avant de le passer à "current" :
 * - le premier box dont la transaction est validée obtient le ticket ;
 * - les autres voient leur transaction rejouée, constatent que le ticket est
 *   pris et passent au ticket en attente suivant (ordre croissant = FIFO).
 * Si un ticket précis (ticketId) était demandé et qu'il vient d'être pris,
 * on bascule aussi sur le suivant en FIFO : l'appelant peut le détecter en
 * comparant l'id retourné à ticketId.
 * Seul le ticket "current" de CE box est clôturé (pas ceux des autres box).
 */
export async function callNextNumber(
  assistantId: string,
  assistantName?: string,
  ticketId?: string,
  block?: string,
): Promise<QueueNumber> {
  const blockNorm = block?.toLowerCase() ?? "";
  const blockKey =
    blockNorm === "block a" ? "A" : blockNorm === "block b" ? "B" : null;

  // 1. Photo des tickets du bloc (les transactions client ne font pas de requêtes)
  const allNumbersSnapshot = await getDocs(
    collection(db, QUEUE_NUMBERS_COLLECTION),
  );
  const allBlockNumbers = allNumbersSnapshot.docs
    .map((d) => ({
      id: d.id,
      number: Number(d.data().number),
      block: ((d.data().block as string) || "").toLowerCase(),
      status: d.data().status as string,
      assistantId: (d.data().assistantId as string) || null,
    }))
    .filter((n) => (blockNorm ? n.block === blockNorm : true));

  // Tickets en cours de CE box uniquement : les autres box du bloc gardent le leur
  const myCurrentIds = allBlockNumbers
    .filter((n) => n.status === "current" && n.assistantId === assistantId)
    .map((n) => n.id);

  // File FIFO : tickets en attente du bloc, du plus petit au plus grand
  const fifo = allBlockNumbers
    .filter((n) => n.status === "waiting")
    .sort((a, b) => a.number - b.number)
    .map((n) => n.id);

  // 2. Candidats : le ticket demandé d'abord, puis le reste de la file en FIFO
  const candidates = ticketId
    ? [ticketId, ...fifo.filter((id) => id !== ticketId)]
    : fifo;

  if (candidates.length === 0) {
    throw new Error("Plus de tickets en attente dans ce bloc.");
  }

  const stateRef = doc(db, QUEUE_STATE_COLLECTION, "current");
  const ticketRef = (id: string) => doc(db, QUEUE_NUMBERS_COLLECTION, id);

  for (const candidateId of candidates) {
    try {
      return await runTransaction(
        db,
        async (tx) => {
          // Toutes les lectures avant les écritures (contrainte des transactions).
          // Chaque document lu est verrouillé de façon optimiste : si un autre
          // box le modifie avant notre validation, la transaction est rejouée.
          const ticketSnap = await tx.get(ticketRef(candidateId));
          if (!ticketSnap.exists() || ticketSnap.data().status !== "waiting") {
            throw new TicketAlreadyTakenError();
          }

          const myCurrentSnaps = await Promise.all(
            myCurrentIds.map((id) => tx.get(ticketRef(id))),
          );

          // Prochain ticket réellement en attente, relu dans la transaction
          let nextWaitingNumberValue: number | null = null;
          const lookahead = fifo
            .filter((id) => id !== candidateId)
            .slice(0, NEXT_LOOKAHEAD);
          for (const id of lookahead) {
            const snap = await tx.get(ticketRef(id));
            if (snap.exists() && snap.data().status === "waiting") {
              nextWaitingNumberValue = Number(snap.data().number);
              break;
            }
          }

          const now = Timestamp.now();

          // 3. Clôturer le ticket précédent de ce box (avec sa durée de service)
          myCurrentSnaps.forEach((snap) => {
            if (!snap.exists() || snap.data().status !== "current") return;
            if (snap.data().assistantId !== assistantId) return;
            const prev = snap.data();
            const update: Record<string, any> = {
              status: "completed",
              completedAt: now,
            };
            if (prev.calledAt?.toMillis && prev.serviceDurationSeconds == null) {
              update.serviceDurationSeconds = Math.floor(
                (now.toMillis() - prev.calledAt.toMillis()) / 1000,
              );
            }
            tx.update(snap.ref, update);
          });

          // 4. Prendre le ticket pour ce box
          tx.update(ticketRef(candidateId), {
            status: "current",
            assistantId: assistantId || null,
            assistantName: assistantName || null,
            calledAt: now,
          });

          const data = ticketSnap.data();
          const ticketNumber = Number(data.number);

          // 5. queue_state : champs legacy + champs du bloc, gardés synchronisés
          const updatePayload: Record<string, any> = {
            updatedAt: now,
            currentNumber: ticketNumber,
            nextNumber: nextWaitingNumberValue,
            currentAssistantId: assistantId || null,
            calledAt: now,
          };
          if (blockKey) {
            updatePayload[`currentNumber${blockKey}`] = ticketNumber;
            updatePayload[`nextNumber${blockKey}`] = nextWaitingNumberValue;
            updatePayload[`currentAssistantId${blockKey}`] =
              assistantId || null;
            updatePayload[`calledAt${blockKey}`] = now;
          }
          tx.set(stateRef, updatePayload, { merge: true });

          return {
            id: candidateId,
            number: ticketNumber,
            block: (data.block as string) || null,
            status: "current",
            assistantId: assistantId || null,
            assistantName: assistantName || null,
            createdAt: timestampToDate(data.createdAt),
            calledAt: now.toDate(),
            completedAt: null,
          } satisfies QueueNumber;
        },
        // Plusieurs box peuvent se disputer les mêmes tickets : on laisse de
        // la marge aux rejeux avant d'abandonner.
        { maxAttempts: 10 },
      );
    } catch (error) {
      if (error instanceof TicketAlreadyTakenError) {
        continue; // pris par un autre box : ticket suivant en FIFO
      }
      throw error;
    }
  }

  throw new Error("Plus de tickets en attente dans ce bloc.");
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

/**
 * Réinitialise les données opérationnelles (tickets de la file + queue_state)
 * SANS perdre les statistiques : chaque ticket déjà appelé (current/completed)
 * est d'abord archivé dans `queue_history`, qui n'est jamais vidé par le reset.
 * Les tickets jamais appelés ("waiting") sont simplement retirés de la file.
 */
export async function resetQueue(): Promise<void> {
  const querySnapshot = await getDocs(collection(db, QUEUE_NUMBERS_COLLECTION));
  const resetAt = Timestamp.now();

  // Limite Firestore : 500 opérations par batch (archive + suppression = 2 ops/ticket)
  const MAX_OPS_PER_BATCH = 450;
  let batch = writeBatch(db);
  let opsInBatch = 0;
  const commits: Promise<void>[] = [];

  const ensureRoom = (ops: number) => {
    if (opsInBatch + ops > MAX_OPS_PER_BATCH) {
      commits.push(batch.commit());
      batch = writeBatch(db);
      opsInBatch = 0;
    }
  };

  querySnapshot.docs.forEach((docData) => {
    const data = docData.data();
    const wasCalled = data.status === "completed" || data.status === "current";
    ensureRoom(wasCalled ? 2 : 1);

    if (wasCalled) {
      // Même id que dans queue_numbers : un reset relancé après un échec
      // partiel réécrit la même archive au lieu de la dupliquer.
      batch.set(doc(db, QUEUE_HISTORY_COLLECTION, docData.id), {
        ...data,
        status: "completed",
        completedAt: data.completedAt ?? resetAt,
        archivedAt: resetAt,
      });
      opsInBatch++;
    }

    batch.delete(docData.ref);
    opsInBatch++;
  });

  if (opsInBatch > 0) commits.push(batch.commit());
  await Promise.all(commits);

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
