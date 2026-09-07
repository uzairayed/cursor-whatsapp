/** Live messages only. Ignore offline/history sync, which often fails to decrypt. */
export function shouldHandleUpsertType(type: string): boolean {
  return type === "notify";
}
