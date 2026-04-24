import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  generationCaptureEnabled,
  writeGenerationCapture,
} from './generation-capture';

describe('generation-capture', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('is disabled by default', () => {
    delete process.env.GENERATION_CAPTURE;
    expect(generationCaptureEnabled()).toBe(false);
  });

  it('enables for 1, true, yes', () => {
    process.env.GENERATION_CAPTURE = '1';
    expect(generationCaptureEnabled()).toBe(true);
    process.env.GENERATION_CAPTURE = 'TRUE';
    expect(generationCaptureEnabled()).toBe(true);
    process.env.GENERATION_CAPTURE = 'yes';
    expect(generationCaptureEnabled()).toBe(true);
  });

  it('writes JSON when enabled and returns path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gen-cap-'));
    process.env.GENERATION_CAPTURE = '1';
    process.env.GENERATION_CAPTURE_DIR = dir;

    const path = await writeGenerationCapture({
      kind: 'generate_sessions',
      inputs: { goal: 'strength', sessions: [] },
      outputs: { sessions: [] },
    });

    expect(path).toBeTruthy();
    const raw = await readFile(path!, 'utf8');
    const parsed = JSON.parse(raw) as {
      schemaVersion: number;
      kind: string;
      inputs: { goal: string };
      meta: { run: { nodeEnv?: string; serviceVersion?: string } };
    };
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.kind).toBe('generate_sessions');
    expect(parsed.inputs.goal).toBe('strength');
    expect(parsed.meta.run).toBeDefined();
    expect(parsed.meta.run).toHaveProperty('nodeEnv');

    await rm(dir, { recursive: true, force: true });
  });

  it('returns null when disabled without writing', async () => {
    delete process.env.GENERATION_CAPTURE;
    const out = await writeGenerationCapture({
      kind: 'generate_single_session',
      inputs: {},
      outputs: {},
    });
    expect(out).toBeNull();
  });
});
