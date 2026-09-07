export function buildConversationKey(phone: string | null, jid: string): string {
  return phone ? `wa:${phone}` : `lid:${jid}`;
}
