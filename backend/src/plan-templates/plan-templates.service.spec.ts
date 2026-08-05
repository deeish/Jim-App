import { NotFoundException } from '@nestjs/common';
import { PlanTemplatesService } from './plan-templates.service';

describe('PlanTemplatesService', () => {
  let service: PlanTemplatesService;

  beforeEach(() => {
    service = new PlanTemplatesService();
  });

  it('lists the three v1 programs as cards, browse order', () => {
    const { templates } = service.list();
    expect(templates.map((t) => t.id)).toEqual([
      'strength-upper-lower',
      'fat-loss-full-body',
      'hybrid-ppl',
    ]);
    for (const card of templates) {
      expect(card.weeksCount).toBe(8);
      expect(card.tagline.trim()).not.toBe('');
      expect(card.defaultWeekdays).toHaveLength(card.daysPerWeek);
      expect(card.sessionMinutes.min).toBeGreaterThan(0);
      expect(card.sessionMinutes.max).toBeGreaterThanOrEqual(
        card.sessionMinutes.min,
      );
      // Cards are the light projection — no weekly programming payload.
      expect(card).not.toHaveProperty('sessions');
      expect(card).not.toHaveProperty('weekMeta');
    }
  });

  it('returns the full program by id', () => {
    const template = service.getById('strength-upper-lower');
    expect(template.sessions).toHaveLength(4);
    expect(template.weekMeta).toHaveLength(8);
    expect(template.sessions[0].exercises[0].weekly).toHaveLength(8);
  });

  it('404s unknown template ids', () => {
    expect(() => service.getById('nope')).toThrow(NotFoundException);
  });
});
