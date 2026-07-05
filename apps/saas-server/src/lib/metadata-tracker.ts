const activeByUser = new Map<string, string>();

export function getActiveMetadataJobId(userId: string): string | null {
  return activeByUser.get(userId) ?? null;
}

export function setActiveMetadataJobId(userId: string, jobId: string): void {
  activeByUser.set(userId, jobId);
}

export function clearActiveMetadataJob(userId: string): void {
  activeByUser.delete(userId);
}

export function clearAllActiveMetadataJobs(): void {
  activeByUser.clear();
}
