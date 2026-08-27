import type { CrewSummary } from '../services/crewService';

/**
 * A stable fingerprint of the crew activity a member would care about having
 * missed: moments (and their pound counts), crewmates' latest sessions, who
 * is resting, and pounds received. The tab badge lights when the stored fingerprint differs
 * from a fresh one; opening the Crew tab stores the fresh fingerprint.
 */
export function computeCrewSignature(summary: CrewSummary): string {
  if (!summary.crew) return '';
  const parts: string[] = [
    ...summary.moments.map((m) => `m:${m.userId ?? 'crew'}:${m.ref}:${m.kudos}`),
    ...summary.members
      .filter((m) => !m.isMe)
      .map((m) => `s:${m.userId}:${m.latestSessionRef ?? 'none'}`),
    // A crewmate going to rest (or coming back) is news worth a badge: it is
    // why their tiles are about to go quiet. `rolling` is deliberately NOT in
    // here — it slides by a day every day, so it would light the badge every
    // morning for nothing.
    ...summary.members
      .filter((m) => !m.isMe)
      .map((m) => `r:${m.userId}:${m.restingSinceIso ?? 'on'}`),
    `me:${summary.members.find((m) => m.isMe)?.kudosWeek ?? 0}`,
    // Someone JOINING is the most interesting thing that can happen to a
    // young crew, and it moved nothing above: a new member with no sessions
    // yet contributes `s:<id>:none`, which is a new part — but a member
    // LEAVING removed one silently. Counting them makes both light the badge.
    `n:${summary.members.length}`,
  ];
  return parts.sort().join('|');
}
