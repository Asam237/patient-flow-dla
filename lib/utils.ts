import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTicket(index: number): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const letterIndex = Math.floor(index / 100);
  const numberPart = index % 100;

  const letter = letters[letterIndex % letters.length];
  const formattedNumber = numberPart.toString().padStart(2, "0");
  return `${letter}${formattedNumber}`;
}

export function parseTicket(ticket: string): number {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const letter = ticket.charAt(0).toUpperCase();
  const numberPart = parseInt(ticket.substring(1));

  const letterIndex = letters.indexOf(letter);
  return letterIndex * 100 + numberPart;
}
