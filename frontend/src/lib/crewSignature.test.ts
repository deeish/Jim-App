import { computeCrewSignature } from './crewSignature';
import type { CrewSummary } from '../services/crewService';

const base = (over: Partial<CrewSummary> = {}): CrewSummary => ({
  crew: { code: 'AAAA2222', name: null, createdAtIso: '2026-08-01T00:00:00Z' },
  meUserId: 'me',
  leadUserId: 'me',
  streakDays: 3,
  members: [
    {
      userId: 'me',
      name: 'Dylan',
      avatarId: null,
      isMe: true,
      todayState: 'rest',
      week: [],
      weekStreak: 1,
      lastSession: null,
      race: { done: 0, planned: 0 },
      hasPlanThisWeek: false,
      kudosWeek: 2,
      latestSessionRef: null,
      kudosLatest: 0,
      iPoundedLatest: false,
    },
    {
      userId: 'sam',
      name: 'Sam',
      avatarId: null,
      isMe: false,
      todayState: 'trained',
      week: [],
      weekStreak: 4,
      lastSession: null,
      race: { done: 1, planned: 2 },
      hasPlanThisWeek: true,
      kudosWeek: 0,
      latestSessionRef: 'day:2026-08-25',
      kudosLatest: 0,
      iPoundedLatest: false,
    },
  ],
  moments: [],
  ...over,
});

describe('computeCrewSignature', () => {
  it('is empty with no crew', () => {
    expect(computeCrewSignature(base({ crew: null }))).toBe('');
  });

  it('is stable across calls and member order', () => {
    const a = base();
    const b = base({ members: [...base().members].reverse() });
    expect(computeCrewSignature(a)).toBe(computeCrewSignature(b));
  });

  it('changes when a crewmate trains, I get pounded, or a moment lands', () => {
    const before = computeCrewSignature(base());
    const trained = base();
    trained.members[1].latestSessionRef = 'day:2026-08-26';
    expect(computeCrewSignature(trained)).not.toBe(before);

    const pounded = base();
    pounded.members[0].kudosWeek = 3;
    expect(computeCrewSignature(pounded)).not.toBe(before);

    const moment = base({
      moments: [
        {
          ref: 'pr:2026-08-25:bench',
          userId: 'sam',
          name: 'Sam',
          avatarId: null,
          kind: 'pr',
          dateIso: '2026-08-25',
          kudos: 0,
          iPounded: false,
          exerciseName: 'Bench',
          weight: 200,
        },
      ],
    });
    expect(computeCrewSignature(moment)).not.toBe(before);
  });

  it('does not change when only my own session updates', () => {
    const before = computeCrewSignature(base());
    const mine = base();
    mine.members[0].latestSessionRef = 'day:2026-08-25';
    expect(computeCrewSignature(mine)).toBe(before);
  });
});
