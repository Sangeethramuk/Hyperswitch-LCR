import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { TransactionLogEntry } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function groupLogs(logs: TransactionLogEntry[]): TransactionLogEntry[][] {
  const groupedLogs: TransactionLogEntry[][] = [];
  let currentGroup: TransactionLogEntry[] = [];

  for (const log of logs) {
    if (log.rawLog && log.rawLog.includes('--------------------')) {
      if (currentGroup.length > 0) {
        groupedLogs.push(currentGroup);
        currentGroup = [];
      }
    }
    currentGroup.push(log);
  }

  if (currentGroup.length > 0) {
    groupedLogs.push(currentGroup);
  }

  return groupedLogs;
}
