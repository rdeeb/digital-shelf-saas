const activeByUser = new Map<string, string>();

export function getActiveSyncRunId(userId: string): string | null {
  return activeByUser.get(userId) ?? null;
}

export function setActiveSyncRunId(userId: string, syncRunId: string): void {
  activeByUser.set(userId, syncRunId);
}

export function clearActiveSyncRun(userId: string): void {
  activeByUser.delete(userId);
}

export function clearAllActiveSyncRuns(): void {
  activeByUser.clear();
}
