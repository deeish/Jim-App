import * as fs from 'fs';
import * as path from 'path';
import {
  parseCrossWeekEvalFixture,
  evaluateCrossWeekProgression,
} from './cross-week-eval';

const capturesDir = path.join(__dirname, 'captures');

describe('cross-week progression eval', () => {
  it('flags a sharp volume jump without deload framing', () => {
    const raw = JSON.parse(
      fs.readFileSync(
        path.join(capturesDir, 'cross-week-two-week-sample.json'),
        'utf8',
      ),
    ) as unknown;
    const parsed = parseCrossWeekEvalFixture(raw);
    expect(parsed).not.toBeNull();
    const { ok, findings } = evaluateCrossWeekProgression(parsed!.weeks);
    expect(ok).toBe(false);
    expect(findings.some((f) => /Cross-week volume/i.test(f))).toBe(true);
  });

  it('flags heavy reuse when comparing the same weekday+type even if session array order differs', () => {
    const raw = JSON.parse(
      fs.readFileSync(
        path.join(capturesDir, 'cross-week-overlap-weekday-order.json'),
        'utf8',
      ),
    ) as unknown;
    const parsed = parseCrossWeekEvalFixture(raw);
    expect(parsed).not.toBeNull();
    const { ok, findings } = evaluateCrossWeekProgression(parsed!.weeks);
    expect(ok).toBe(false);
    expect(findings.some((f) => /Cross-week overlap/i.test(f))).toBe(true);
  });

  it('flags heavy reuse of the same exercise ids in aligned slots', () => {
    const raw = JSON.parse(
      fs.readFileSync(
        path.join(capturesDir, 'cross-week-overlap-sample.json'),
        'utf8',
      ),
    ) as unknown;
    const parsed = parseCrossWeekEvalFixture(raw);
    expect(parsed).not.toBeNull();
    const { ok, findings } = evaluateCrossWeekProgression(parsed!.weeks);
    expect(ok).toBe(false);
    expect(findings.some((f) => /Cross-week overlap/i.test(f))).toBe(true);
  });

  it('stays quiet when week two is explicitly a deload and volume drops', () => {
    const raw = JSON.parse(
      fs.readFileSync(
        path.join(capturesDir, 'cross-week-deload-ok-sample.json'),
        'utf8',
      ),
    ) as unknown;
    const parsed = parseCrossWeekEvalFixture(raw);
    expect(parsed).not.toBeNull();
    const { ok, findings } = evaluateCrossWeekProgression(parsed!.weeks);
    expect(ok).toBe(true);
    expect(findings).toEqual([]);
  });
});
