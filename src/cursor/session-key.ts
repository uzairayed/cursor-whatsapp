export function sessionStorageKey(projectKey: string, conversationKey?: string): string {
  if (!conversationKey) return projectKey;
  return `${projectKey}__${conversationKey}`;
}
