/**
 * Property-based tests for assessment history ordering.
 *
 * The GET /api/symcheck/history endpoint issues:
 *   SELECT * FROM ai_assessments WHERE userId = ? ORDER BY createdAt DESC
 *
 * The ordering guarantee is therefore a pure function of the `createdAt`
 * timestamps on the returned records. It is modelled here as `sortNewestFirst`
 * so the property can be verified in isolation without any HTTP or database
 * dependencies.
 *
 * **Validates: Requirements 3.2, 3.8**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Minimal assessment shape (only the fields relevant to ordering)
// ---------------------------------------------------------------------------

interface AssessmentRecord {
  id: number;
  userId: number;
  createdAt: string; // ISO-8601 datetime string, e.g. "2024-03-15T10:30:00.000Z"
  symptoms: string;
  diagnosis: string;
  urgency: 'EMERGENCY' | 'URGENT' | 'NON-URGENT';
  confidence: number;
}

// ---------------------------------------------------------------------------
// Source under test (mirrors the ORDER BY createdAt DESC in Server.js)
//
// The SQL clause `ORDER BY createdAt DESC` is equivalent to sorting the
// JavaScript array by the numeric value of `new Date(createdAt)` in
// descending order.
// ---------------------------------------------------------------------------

/**
 * Sort an array of assessment records newest-first (descending createdAt).
 * Returns a new array — does not mutate the input.
 */
function sortNewestFirst(records: AssessmentRecord[]): AssessmentRecord[] {
  return [...records].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * Return true when `records` is already sorted newest-first.
 * Used as the postcondition in property assertions.
 */
function isNewestFirst(records: AssessmentRecord[]): boolean {
  for (let i = 0; i < records.length - 1; i++) {
    const current = new Date(records[i].createdAt).getTime();
    const next = new Date(records[i + 1].createdAt).getTime();
    if (current < next) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generate a valid ISO-8601 datetime string within a realistic range.
 * Uses integer milliseconds to avoid fast-check shrinking producing invalid
 * Date objects when using fc.date() with min/max constraints.
 *
 * Range: 2000-01-01 → 2099-12-31 (approx 3.15 × 10^12 ms span)
 */
const MIN_MS = new Date('2000-01-01T00:00:00.000Z').getTime(); // 946684800000
const MAX_MS = new Date('2099-12-31T23:59:59.999Z').getTime(); // 4102444799999

const isoDateArb = fc
  .integer({ min: MIN_MS, max: MAX_MS })
  .map((ms) => new Date(ms).toISOString());

/** Generate a single assessment record with an arbitrary createdAt. */
const assessmentArb = (id: number): fc.Arbitrary<AssessmentRecord> =>
  fc.record({
    id: fc.constant(id),
    userId: fc.integer({ min: 1, max: 100000 }),
    createdAt: isoDateArb,
    symptoms: fc.string({ minLength: 1, maxLength: 200 }),
    diagnosis: fc.string({ minLength: 1, maxLength: 200 }),
    urgency: fc.constantFrom('EMERGENCY', 'URGENT', 'NON-URGENT') as fc.Arbitrary<
      'EMERGENCY' | 'URGENT' | 'NON-URGENT'
    >,
    confidence: fc.float({ min: 0, max: 100, noNaN: true }),
  });

/** Generate an array of 0–20 assessment records with unique IDs. */
const assessmentListArb: fc.Arbitrary<AssessmentRecord[]> = fc
  .array(fc.integer({ min: 1, max: 100000 }), { minLength: 0, maxLength: 20 })
  .chain((ids) => {
    const uniqueIds = [...new Set(ids)];
    return fc.tuple(...uniqueIds.map((id) => assessmentArb(id)));
  })
  .map((tuple) => tuple as AssessmentRecord[]);

// ---------------------------------------------------------------------------
// Property 7a: sortNewestFirst always produces a newest-first ordering
//
// For any collection of assessments with varying createdAt timestamps,
// sortNewestFirst must return them in descending chronological order.
//
// Validates: Requirements 3.2, 3.8
// ---------------------------------------------------------------------------

describe('Property 7a — sortNewestFirst always produces newest-first ordering', () => {
  it('result satisfies isNewestFirst for any input list', () => {
    fc.assert(
      fc.property(assessmentListArb, (records) => {
        const sorted = sortNewestFirst(records);
        expect(isNewestFirst(sorted)).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });

  it('result length equals input length (no records dropped or duplicated)', () => {
    fc.assert(
      fc.property(assessmentListArb, (records) => {
        const sorted = sortNewestFirst(records);
        expect(sorted.length).toBe(records.length);
      }),
      { numRuns: 1000 },
    );
  });

  it('result contains the same records as the input (set equality)', () => {
    fc.assert(
      fc.property(assessmentListArb, (records) => {
        const sorted = sortNewestFirst(records);
        const inputIds = records.map((r) => r.id).sort();
        const sortedIds = sorted.map((r) => r.id).sort();
        expect(sortedIds).toEqual(inputIds);
      }),
      { numRuns: 1000 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7b: Idempotency — sorting an already-sorted list is a no-op
//
// Applying sortNewestFirst to an already-sorted list must return a list
// that is still newest-first and has the same element order.
//
// Validates: Requirements 3.2, 3.8
// ---------------------------------------------------------------------------

describe('Property 7b — sortNewestFirst is idempotent', () => {
  it('sorting a sorted list produces the same order', () => {
    fc.assert(
      fc.property(assessmentListArb, (records) => {
        const onceSorted = sortNewestFirst(records);
        const twiceSorted = sortNewestFirst(onceSorted);
        expect(twiceSorted.map((r) => r.id)).toEqual(onceSorted.map((r) => r.id));
      }),
      { numRuns: 1000 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7c: Newest record always appears first
//
// For any non-empty list, the record with the maximum createdAt timestamp
// must be the first element after sorting.
//
// Validates: Requirements 3.2, 3.8
// ---------------------------------------------------------------------------

describe('Property 7c — Record with the latest createdAt is always first', () => {
  it('first element has the maximum createdAt value', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 100000 }),
            userId: fc.integer({ min: 1, max: 100000 }),
            createdAt: isoDateArb,
            symptoms: fc.string({ minLength: 1 }),
            diagnosis: fc.string({ minLength: 1 }),
            urgency: fc.constantFrom('EMERGENCY', 'URGENT', 'NON-URGENT') as fc.Arbitrary<
              'EMERGENCY' | 'URGENT' | 'NON-URGENT'
            >,
            confidence: fc.float({ min: 0, max: 100, noNaN: true }),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        (records) => {
          const sorted = sortNewestFirst(records);
          const maxTime = Math.max(...records.map((r) => new Date(r.createdAt).getTime()));
          const firstTime = new Date(sorted[0].createdAt).getTime();
          expect(firstTime).toBe(maxTime);
        },
      ),
      { numRuns: 1000 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7d: Oldest record always appears last
//
// For any non-empty list, the record with the minimum createdAt timestamp
// must be the last element after sorting.
//
// Validates: Requirements 3.2, 3.8
// ---------------------------------------------------------------------------

describe('Property 7d — Record with the earliest createdAt is always last', () => {
  it('last element has the minimum createdAt value', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 100000 }),
            userId: fc.integer({ min: 1, max: 100000 }),
            createdAt: isoDateArb,
            symptoms: fc.string({ minLength: 1 }),
            diagnosis: fc.string({ minLength: 1 }),
            urgency: fc.constantFrom('EMERGENCY', 'URGENT', 'NON-URGENT') as fc.Arbitrary<
              'EMERGENCY' | 'URGENT' | 'NON-URGENT'
            >,
            confidence: fc.float({ min: 0, max: 100, noNaN: true }),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        (records) => {
          const sorted = sortNewestFirst(records);
          const minTime = Math.min(...records.map((r) => new Date(r.createdAt).getTime()));
          const lastTime = new Date(sorted[sorted.length - 1].createdAt).getTime();
          expect(lastTime).toBe(minTime);
        },
      ),
      { numRuns: 1000 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7e: Boundary — empty and single-element lists are trivially ordered
//
// Validates: Requirements 3.2, 3.8
// ---------------------------------------------------------------------------

describe('Property 7e — Edge cases: empty and single-element lists', () => {
  it('empty list sorts to an empty list', () => {
    const result = sortNewestFirst([]);
    expect(result).toEqual([]);
  });

  it('single-element list is unchanged after sorting', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.integer({ min: 1, max: 100000 }),
          userId: fc.integer({ min: 1, max: 100000 }),
          createdAt: isoDateArb,
          symptoms: fc.string({ minLength: 1 }),
          diagnosis: fc.string({ minLength: 1 }),
          urgency: fc.constantFrom('EMERGENCY', 'URGENT', 'NON-URGENT') as fc.Arbitrary<
            'EMERGENCY' | 'URGENT' | 'NON-URGENT'
          >,
          confidence: fc.float({ min: 0, max: 100, noNaN: true }),
        }),
        (record) => {
          const result = sortNewestFirst([record]);
          expect(result.length).toBe(1);
          expect(result[0].id).toBe(record.id);
        },
      ),
      { numRuns: 500 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7f: Determinism — same input always produces the same output
//
// sortNewestFirst must be a pure function: identical inputs must always
// yield identical outputs.
//
// Validates: Requirements 3.2, 3.8
// ---------------------------------------------------------------------------

describe('Property 7f — sortNewestFirst is deterministic (pure function)', () => {
  it('two calls with the same input produce identical output', () => {
    fc.assert(
      fc.property(assessmentListArb, (records) => {
        const first = sortNewestFirst(records);
        const second = sortNewestFirst(records);
        expect(first.map((r) => r.id)).toEqual(second.map((r) => r.id));
      }),
      { numRuns: 500 },
    );
  });
});
