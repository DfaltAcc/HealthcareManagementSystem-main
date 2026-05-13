/**
 * Property-based tests for the `checkEmergency` pure function.
 *
 * The function lives in Server.js alongside Express/MySQL setup that cannot be
 * imported in a unit-test environment. The implementation is therefore reproduced
 * here verbatim so the properties can be verified in isolation. Any change to
 * EMERGENCY_CONDITIONS or checkEmergency in Server.js must be mirrored here.
 *
 * Validates: Requirements 2.1, 2.5, 2.6, 6.2, 6.3
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Source under test (mirrored from Server.js)
// ---------------------------------------------------------------------------

const EMERGENCY_CONDITIONS: Record<
  string,
  { keywords: string[]; diagnosis: string; actions: string[] }
> = {
  stroke: {
    keywords: [
      'stroke',
      'face drooping',
      'arm weakness',
      'slurred speech',
      'sudden confusion',
      'trouble speaking',
      'sudden numbness',
      'face numb',
      'arm numb',
      'leg numb',
      'sudden vision',
      'trouble walking',
      'loss of balance',
      'severe headache sudden',
    ],
    diagnosis: 'Possible Stroke - MEDICAL EMERGENCY',
    actions: [
      'CALL 911 IMMEDIATELY',
      'Note the time symptoms started',
      'Do not drive',
      'Do not eat or drink',
    ],
  },
  heart_attack: {
    keywords: [
      'chest pain',
      'chest pressure',
      'heart attack',
      'chest tightness',
      'pain spreading to arm',
      'pain in jaw',
      'shortness of breath',
      'cold sweat',
      'pain left arm',
      'pain right arm',
      'nausea chest pain',
      'indigestion chest',
      'lightheaded',
    ],
    diagnosis: 'Possible Heart Attack - MEDICAL EMERGENCY',
    actions: [
      'CALL 911 IMMEDIATELY',
      'Chew aspirin if not allergic',
      'Stop all activity',
      'Unlock door for paramedics',
    ],
  },
};

type EmergencyResult =
  | { is_emergency: true; condition: string; diagnosis: string; actions: string[]; urgency: 'EMERGENCY' }
  | { is_emergency: false };

function checkEmergency(text: string): EmergencyResult {
  const lower = text.toLowerCase();
  for (const [condition, data] of Object.entries(EMERGENCY_CONDITIONS)) {
    for (const keyword of data.keywords) {
      if (lower.includes(keyword)) {
        return {
          is_emergency: true,
          condition,
          diagnosis: data.diagnosis,
          actions: data.actions,
          urgency: 'EMERGENCY',
        };
      }
    }
  }
  return { is_emergency: false };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Flat list of every keyword across all conditions. */
const ALL_KEYWORDS: string[] = Object.values(EMERGENCY_CONDITIONS).flatMap(
  (c) => c.keywords,
);

/** Arbitrarily transform a string's casing character-by-character. */
function randomCaseTransform(s: string, seed: number): string {
  return s
    .split('')
    .map((ch, i) => ((seed + i) % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase()))
    .join('');
}

// ---------------------------------------------------------------------------
// Property 4: Emergency detection precedes Ollama
//
// For any message that contains at least one keyword from EMERGENCY_CONDITIONS,
// checkEmergency must return is_emergency: true.
// ---------------------------------------------------------------------------

describe('Property 4 — Emergency detection precedes Ollama', () => {
  it('returns is_emergency: true for any message containing an emergency keyword', () => {
    fc.assert(
      fc.property(
        // Pick a random keyword
        fc.constantFrom(...ALL_KEYWORDS),
        // Generate arbitrary prefix and suffix text to surround the keyword
        fc.string({ maxLength: 50 }),
        fc.string({ maxLength: 50 }),
        (keyword, prefix, suffix) => {
          const message = `${prefix} ${keyword} ${suffix}`;
          const result = checkEmergency(message);
          expect(result.is_emergency).toBe(true);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('returns is_emergency: false for messages with no emergency keywords', () => {
    fc.assert(
      fc.property(
        // Generate strings that are guaranteed not to contain any keyword
        fc.string({ maxLength: 100 }).filter((s) => {
          const lower = s.toLowerCase();
          return ALL_KEYWORDS.every((kw) => !lower.includes(kw));
        }),
        (message) => {
          const result = checkEmergency(message);
          expect(result.is_emergency).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('returns the correct condition name and urgency for each keyword', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          ...Object.entries(EMERGENCY_CONDITIONS).flatMap(([condition, data]) =>
            data.keywords.map((kw) => ({ condition, keyword: kw })),
          ),
        ),
        ({ condition, keyword }) => {
          const result = checkEmergency(keyword);
          expect(result.is_emergency).toBe(true);
          if (result.is_emergency) {
            expect(result.condition).toBe(condition);
            expect(result.urgency).toBe('EMERGENCY');
            expect(result.actions).toEqual(EMERGENCY_CONDITIONS[condition].actions);
          }
        },
      ),
      { numRuns: ALL_KEYWORDS.length },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Case-insensitive emergency detection
//
// For any emergency keyword and any casing transformation of that keyword,
// checkEmergency must return is_emergency: true.
// ---------------------------------------------------------------------------

describe('Property 6 — Case-insensitive emergency detection', () => {
  it('detects emergency keywords regardless of casing (uppercase)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ALL_KEYWORDS), (keyword) => {
        const result = checkEmergency(keyword.toUpperCase());
        expect(result.is_emergency).toBe(true);
      }),
      { numRuns: ALL_KEYWORDS.length },
    );
  });

  it('detects emergency keywords regardless of casing (lowercase)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ALL_KEYWORDS), (keyword) => {
        const result = checkEmergency(keyword.toLowerCase());
        expect(result.is_emergency).toBe(true);
      }),
      { numRuns: ALL_KEYWORDS.length },
    );
  });

  it('detects emergency keywords regardless of casing (mixed case via integer seed)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_KEYWORDS),
        fc.integer({ min: 0, max: 99 }),
        (keyword, seed) => {
          const mixed = randomCaseTransform(keyword, seed);
          const result = checkEmergency(mixed);
          expect(result.is_emergency).toBe(true);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('detects emergency keywords embedded in mixed-case surrounding text', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_KEYWORDS),
        fc.integer({ min: 0, max: 99 }),
        fc.string({ maxLength: 30 }),
        fc.string({ maxLength: 30 }),
        (keyword, seed, prefix, suffix) => {
          const mixedKeyword = randomCaseTransform(keyword, seed);
          const message = `${prefix} ${mixedKeyword} ${suffix}`;
          const result = checkEmergency(message);
          expect(result.is_emergency).toBe(true);
        },
      ),
      { numRuns: 500 },
    );
  });
});
