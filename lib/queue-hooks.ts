import { useState, useEffect } from "react";
import {
  getAllQueueNumbers,
  callNextNumber as callNextNumberService,
  addNumberToQueue,
  completeCurrentNumber,
} from "./queue-service";
import type { QueueNumber } from "./types";

export function useQueueNumbers() {
  const [queueNumbers, setQueueNumbers] = useState<QueueNumber[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQueueNumbers = async () => {
    try {
      const numbers = await getAllQueueNumbers();
      setQueueNumbers(numbers);
    } catch (error) {
      console.error("Error fetching queue numbers:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueueNumbers();
    const interval = setInterval(fetchQueueNumbers, 2000);
    return () => clearInterval(interval);
  }, []);

  return {
    queueNumbers,
    loading,
    refetch: fetchQueueNumbers,
  };
}

export async function callNextNumber(
  assistantId: string,
  assistantName?: string,
  ticketId?: string,
  block?: string,
) {
  try {
    const result = await callNextNumberService(
      assistantId,
      assistantName,
      ticketId,
      block,
    );
    return { data: result, error: null };
  } catch (error: any) {
    return { data: null, error: { message: error.message } };
  }
}

export async function completeNumber(block?: string) {
  try {
    await completeCurrentNumber(block);
    return { error: null };
  } catch (error: any) {
    return { error: { message: error.message } };
  }
}

export async function addNewQueueNumber(
  block: "block a" | "block b",
): Promise<QueueNumber> {
  const allNumbers = await getAllQueueNumbers();
  const blockNumbers = allNumbers.filter(
    (n) => n.block?.toLowerCase() === block.toLowerCase(),
  );

  // Initialisation à -1 pour que le premier numéro généré soit 0 (ex: A00)
  const maxIndex =
    blockNumbers.length > 0
      ? Math.max(...blockNumbers.map((n) => n.number))
      : -1;

  const nextNumber = maxIndex + 1;
  return await addNumberToQueue(nextNumber, block);
}
