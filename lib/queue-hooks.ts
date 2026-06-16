import { useState, useEffect } from "react";
import {
  getAllQueueNumbers,
  callNextNumber as callNextNumberService,
  completeCurrentNumber,
  addNumberToQueue,
  getQueueState,
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
) {
  try {
    const result = await callNextNumberService(assistantId, assistantName);
    return { data: result, error: null };
  } catch (error: any) {
    return { data: null, error: { message: error.message } };
  }
}

export async function completeNumber(numberId: string) {
  try {
    await completeCurrentNumber();
    return { error: null };
  } catch (error: any) {
    return { error: { message: error.message } };
  }
}

export async function addNewQueueNumber(): Promise<QueueNumber> {
  const allNumbers = await getAllQueueNumbers();
  const maxIndex =
    allNumbers.length > 0 ? Math.max(...allNumbers.map((n) => n.number)) : -1; // On commence à -1 pour que le premier soit 0 (A00)
  const nextIndex = maxIndex + 1;
  return await addNumberToQueue(nextIndex);
}
