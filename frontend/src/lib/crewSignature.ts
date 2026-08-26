import type { CrewSummary } from '../services/crewService';

/**
 * A stable fingerprint of the crew activity a member would care about having
 * missed: moments (and their pound counts), crewmates' latest sessions, and
 * pounds received. The tab badge lights when the stored fingerprint differs
 * from a fresh one; opening the Crew tab stores the fresh fingerprint.
 */
export function computeCrewSignature(summary: CrewSummary): string {
  if (!summary.crew) return '';
  const parts: string[] = [
    ...summary.moments.map((m) => `m:${m.userId ?? 'crew'}:${m.ref}:${m.kudos}`),
    ...summary.members
      .filter((m) => !m.isMe)
      .map((m) => `s:${m.userId}:${m.latestSessionRef ?? 'none'}`),
    `me:${summary.members.find((m) => m.isMe)?.kudosWeek ?? 0}`,
  ];
  return parts.sort().join('|');
}
