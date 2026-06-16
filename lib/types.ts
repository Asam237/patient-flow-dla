export type UserRole = "admin" | "assistant";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  color?: string;
  isActive: boolean;
  createdAt: Date;
}

export interface QueueNumber {
  id: string;
  number: number;
  status: "waiting" | "current" | "completed";
  assistantId?: string | null;
  assistantName?: string | null;
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
}
