export type UserRole = "admin" | "assistant";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  color?: string;
  block?: string;
  startNumber?: number;
  isActive: boolean;
  createdAt: Date;
}

export interface QueueNumber {
  id: string;
  number: number;
  status: "waiting" | "current" | "completed";
  assistantId?: string | null;
  assistantName?: string | null;
  block?: string | null;
  createdAt: Date;
  calledAt?: Date | null;
  completedAt?: Date | null;
  serviceDurationSeconds?: number;
}

export interface QueueState {
  id: string;
  currentNumber: number | null;
  nextNumber: number | null;
  currentAssistantId?: string | null;
  updatedAt: Date;
  currentNumberA?: number | null;
  nextNumberA?: number | null;
  currentAssistantIdA?: string | null;
  currentNumberB?: number | null;
  nextNumberB?: number | null;
  currentAssistantIdB?: string | null;
}
