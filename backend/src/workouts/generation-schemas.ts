import type { LlmJsonSchema } from '../llm/llm-client';

/**
 * JSON schemas the provider ENFORCES on generation output.
 *
 * These mirror what the parsers in `workout-generator.service.ts` already
 * accept by hand; the parsers keep their guards (an id can still be one the
 * model made up, a count can still be out of range) because enforcement
 * covers shape, not meaning. Optional fields stay optional rather than
 * nullable: the prompts say "omit notes", and an omitted key is what the
 * parsers expect.
 */

function exerciseSchema(
  withNotes: boolean,
  withWeight: boolean,
): LlmJsonSchema {
  const properties: Record<string, unknown> = {
    exerciseId: { type: 'string' },
    sets: { type: 'integer' },
    reps: { type: 'integer' },
  };
  if (withWeight) properties.weight = { type: 'number' };
  if (withNotes) properties.notes = { type: 'string' };
  return {
    type: 'object',
    properties,
    required: ['exerciseId', 'sets', 'reps'],
    additionalProperties: false,
  };
}

/** `generateFullProgram`: week 1 in one call, `days` pinned to the session count. */
export function fullProgramSchema(
  dayCount: number,
  withNotes: boolean,
): LlmJsonSchema {
  return {
    type: 'object',
    properties: {
      programSummary: { type: 'string' },
      days: {
        type: 'array',
        minItems: dayCount,
        maxItems: dayCount,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            reasoning: { type: 'string' },
            warmUp: { type: 'string' },
            coolDown: { type: 'string' },
            exercises: {
              type: 'array',
              minItems: 1,
              items: exerciseSchema(withNotes, false),
            },
          },
          required: ['name', 'reasoning', 'warmUp', 'coolDown', 'exercises'],
          additionalProperties: false,
        },
      },
    },
    required: ['programSummary', 'days'],
    additionalProperties: false,
  };
}

/** `polishSimpleBatchSessionCopy`: titles and copy only, exercises are fixed. */
export function polishCopySchema(dayCount: number): LlmJsonSchema {
  return {
    type: 'object',
    properties: {
      days: {
        type: 'array',
        minItems: dayCount,
        maxItems: dayCount,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            reasoning: { type: 'string' },
            warmUp: { type: 'string' },
            coolDown: { type: 'string' },
          },
          required: ['name', 'reasoning', 'warmUp', 'coolDown'],
          additionalProperties: false,
        },
      },
    },
    required: ['days'],
    additionalProperties: false,
  };
}

/** `generateWithLlm`: one session. */
export function singleSessionSchema(options: {
  withNotes: boolean;
  withCardioFinisher: boolean;
}): LlmJsonSchema {
  const properties: Record<string, unknown> = {
    name: { type: 'string' },
    day: { type: 'string' },
    reasoning: { type: 'string' },
    warmUp: { type: 'string' },
    coolDown: { type: 'string' },
    exercises: {
      type: 'array',
      minItems: 1,
      items: exerciseSchema(options.withNotes, true),
    },
  };
  if (options.withCardioFinisher) {
    properties.cardioFinisher = {
      type: 'object',
      properties: { suggestion: { type: 'string' } },
      required: ['suggestion'],
      additionalProperties: false,
    };
  }
  return {
    type: 'object',
    properties,
    required: ['name', 'reasoning', 'warmUp', 'coolDown', 'exercises'],
    additionalProperties: false,
  };
}
