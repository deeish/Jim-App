import type { GeneratedSession } from '../session-enrichment';
import type { GenerateSessionsDto } from '../dto/generate-sessions.dto';

export type CrossWeekEvalWeekSlice = {
  weekIndex: number;
  programSummary?: string;
  specs: GenerateSessionsDto['sessions'];
  sessionsOut: GeneratedSession[];
};

export type CrossWeekEvalFixture = {
  schemaVersion: number;
  kind: 'cross_week_eval_fixture';
  weeks: CrossWeekEvalWeekSlice[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function parseCrossWeekEvalFixture(
  raw: unknown,
): CrossWeekEvalFixture | null {
  const r = asRecord(raw);
  if (!r) return null;
  if (r.kind !== 'cross_week_eval_fixture') return null;
  const weeksRaw = r.weeks;
  if (!Array.isArray(weeksRaw) || weeksRaw.length < 2) return null;
  const weeks: CrossWeekEvalWeekSlice[] = [];
  for (const w of weeksRaw) {
    const wr = asRecord(w);
    if (!wr) return null;
    const specs = wr.sessions;
    const sessionsOut = wr.sessionsOut;
    if (!Array.isArray(specs) || !Array.isArray(sessionsOut)) return null;
    if (specs.length !== sessionsOut.length) return null;
    const weekIndex = typeof wr.weekIndex === 'number' ? wr.weekIndex : NaN;
    if (!Number.isFinite(weekIndex)) return null;
    weeks.push({
      weekIndex,
      programSummary:
        typeof wr.programSummary === 'string' ? wr.programSummary : undefined,
      specs: specs as GenerateSessionsDto['sessions'],
      sessionsOut: sessionsOut as GeneratedSession[],
    });
  }
  return {
    schemaVersion: typeof r.schemaVersion === 'number' ? r.schemaVersion : 1,
    kind: 'cross_week_eval_fixture',
    weeks,
  };
}

function normWeekday(raw: string | undefined): string {
  return (raw ?? '').trim().toLowerCase();
}

function alignmentKey(
  spec: GenerateSessionsDto['sessions'][number] | undefined,
  session: GeneratedSession | undefined,
): string | null {
  const wd = normWeekday(spec?.weekday ?? session?.weekday);
  const ty = (spec?.type ?? 'strength').toLowerCase();
  if (!wd) return null;
  return `${wd}|${ty}`;
}

function mapSessionsByWeekdayAndType(
  specs: GenerateSessionsDto['sessions'],
  sessionsOut: GeneratedSession[],
): Map<
  string,
  { session: GeneratedSession; title?: string; weekdayLabel: string }
> {
  const m = new Map<
    string,
    { session: GeneratedSession; title?: string; weekdayLabel: string }
  >();
  for (let i = 0; i < sessionsOut.length; i++) {
    const spec = specs[i];
    const session = sessionsOut[i];
    const key = alignmentKey(spec, session);
    if (!key) continue;
    const weekdayLabel =
      (spec?.weekday ?? session?.weekday ?? '').trim() || 'same day';
    m.set(key, {
      session: session!,
      title: spec?.title,
      weekdayLabel,
    });
  }
  return m;
}

function totalWorkingSets(sessions: GeneratedSession[]): number {
  let t = 0;
  for (const s of sessions) {
    for (const e of s.exercises ?? []) {
      const sets = Number(e.sets);
      if (Number.isFinite(sets) && sets > 0) t += sets;
    }
  }
  return t;
}

/**
 * Lightweight progression sanity checks across two frozen week slices (no Groq).
 * Flags large set-volume jumps without explicit deload language, and heavy reuse
 * of the same exercise ids on the same calendar day + session type (not fragile array index).
 */
export function evaluateCrossWeekProgression(weeks: CrossWeekEvalWeekSlice[]): {
  ok: boolean;
  findings: string[];
} {
  const findings: string[] = [];
  if (weeks.length < 2) return { ok: true, findings };
  const sorted = [...weeks].sort((a, b) => a.weekIndex - b.weekIndex);
  const prior = sorted[0]!;
  const next = sorted[1]!;
  const setA = totalWorkingSets(prior.sessionsOut);
  const setB = totalWorkingSets(next.sessionsOut);
  if (setA > 0 && setB / setA > 1.35) {
    const deloadHint = (next.programSummary ?? '')
      .toLowerCase()
      .includes('deload');
    if (!deloadHint) {
      findings.push(
        `Cross-week volume: total working sets rose ~${Math.round((setB / setA - 1) * 100)}% from week ${prior.weekIndex} to ${next.weekIndex} without an explicit deload note in the later week summary.`,
      );
    }
  }

  const mapPrior = mapSessionsByWeekdayAndType(prior.specs, prior.sessionsOut);
  const mapNext = mapSessionsByWeekdayAndType(next.specs, next.sessionsOut);

  for (const [key, bEntry] of mapNext) {
    const aEntry = mapPrior.get(key);
    if (!aEntry) continue;
    const idsA = new Set(
      (aEntry.session.exercises ?? [])
        .map((e) => e.exerciseId?.trim())
        .filter((x): x is string => !!x),
    );
    const idsB = new Set(
      (bEntry.session.exercises ?? [])
        .map((e) => e.exerciseId?.trim())
        .filter((x): x is string => !!x),
    );
    let inter = 0;
    for (const x of idsA) {
      if (idsB.has(x)) inter++;
    }
    const union = new Set([...idsA, ...idsB]).size;
    if (union >= 4 && inter >= 4) {
      const label = aEntry.title?.trim() || bEntry.title?.trim() || 'session';
      findings.push(
        `Cross-week overlap: ${label} (${aEntry.weekdayLabel}) reuses most of the same exercise ids week over week—consider rotation or varied stress.`,
      );
      break;
    }
  }

  return { ok: findings.length === 0, findings };
}
