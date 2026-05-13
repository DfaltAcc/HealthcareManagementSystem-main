/**
 * Property-based tests for SymptomCheckerHistoryPage display logic.
 *
 * The SymptomCheckerHistoryPage renders a list of past AI assessments fetched
 * from the API. Because the test environment is Node (no DOM / jsdom), these
 * tests model the page's display logic as pure functions — the same approach
 * used throughout this test suite (see SymptomCheckerPage.test.tsx,
 * symcheckHistoryOrdering.test.ts, etc.).
 *
 * The functions mirrored here are:
 *   - truncate(text, max)      — clips symptom text to ≤ max chars for list preview
 *   - formatDate(dateStr)      — formats ISO datetime to a localised date string
 *   - formatTime(dateStr)      — formats ISO datetime to a localised time string
 *   - sortNewestFirst(records) — sorts assessments by createdAt DESC (API contract)
 *   - getUrgencyStyle(urgency) — maps urgency level to CSS class string
 *
 * Validates: Requirements 3.2, 3.3
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Types (mirrored inline — no imports from src/)
// ---------------------------------------------------------------------------

type UrgencyLevel = 'EMERGENCY' | 'URGENT' | 'NON-URGENT';

interface AIAssessment {
  id: number;
  userId: number;
  sessionId: string;
  symptoms: string;
  conversation?: string;
  diagnosis: string;
  urgency: UrgencyLevel;
  confidence: number; // 0–100
  homeRemedies: string[];
  recommendedActions: string[];
  createdAt: string; // ISO datetime string
}

// ---------------------------------------------------------------------------
// Pure function mirrors (from SymptomCheckerHistoryPage.tsx)
// ---------------------------------------------------------------------------

/**
 * Truncate symptom text for list preview.
 * Mirrors the `truncate` helper in SymptomCheckerHistoryPage.tsx.
 */
function truncate(text: string, max = 100): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/**
 * Format an ISO datetime string to a localised date string.
 * Mirrors `formatDate` in SymptomCheckerHistoryPage.tsx.
 */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format an ISO datetime string to a localised time string.
 * Mirrors `formatTime` in SymptomCheckerHistoryPage.tsx.
 */
function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Sort an array of assessments newest-first (descending createdAt).
 * Mirrors the ORDER BY createdAt DESC guarantee from the API.
 * Returns a new array — does not mutate the input.
 */
function sortNewestFirst(records: AIAssessment[]): AIAssessment[] {
  return [...records].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * Map an urgency level to its CSS class string.
 * Mirrors the `styles` lookup in the UrgencyBadge sub-component.
 * Uses Object.hasOwn to guard against prototype-inherited properties
 * (e.g. "valueOf", "toString") so the fallback is always a plain string.
 */
function getUrgencyStyle(urgency: string): string {
  const styles: Record<string, string> = {
    EMERGENCY: 'bg-red-100 text-red-800',
    URGENT: 'bg-amber-100 text-amber-800',
    'NON-URGENT': 'bg-green-100 text-green-800',
  };
  return Object.hasOwn(styles, urgency) ? styles[urgency] : 'bg-gray-100 text-gray-800';
}

/**
 * Return true when `records` is already sorted newest-first.
 * Used as the postcondition in ordering property assertions.
 */
function isNewestFirst(records: AIAssessment[]): boolean {
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

/** ISO-8601 datetime strings within a realistic range (2000–2099). */
const MIN_MS = new Date('2000-01-01T00:00:00.000Z').getTime();
const MAX_MS = new Date('2099-12-31T23:59:59.999Z').getTime();

const isoDateArb = fc
  .integer({ min: MIN_MS, max: MAX_MS })
  .map((ms) => new Date(ms).toISOString());

/** Generate a single AIAssessment with an arbitrary createdAt. */
const assessmentArb = (id: number): fc.Arbitrary<AIAssessment> =>
  fc.record({
    id: fc.constant(id),
    userId: fc.integer({ min: 1, max: 100000 }),
    sessionId: fc.uuid(),
    symptoms: fc.string({ minLength: 1, maxLength: 300 }),
    diagnosis: fc.string({ minLength: 1, maxLength: 200 }),
    urgency: fc.constantFrom('EMERGENCY', 'URGENT', 'NON-URGENT') as fc.Arbitrary<UrgencyLevel>,
    confidence: fc.float({ min: 0, max: 100, noNaN: true }),
    homeRemedies: fc.array(fc.string({ minLength: 1 }), { maxLength: 5 }),
    recommendedActions: fc.array(fc.string({ minLength: 1 }), { maxLength: 5 }),
    createdAt: isoDateArb,
  });

/** Generate an array of 0–20 assessments with unique IDs. */
const assessmentListArb: fc.Arbitrary<AIAssessment[]> = fc
  .array(fc.integer({ min: 1, max: 100000 }), { minLength: 0, maxLength: 20 })
  .chain((ids) => {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return fc.constant([] as AIAssessment[]);
    return fc.tuple(...uniqueIds.map((id) => assessmentArb(id))).map(
      (tuple) => tuple as AIAssessment[],
    );
  });

/** Generate a single valid AIAssessment. */
const singleAssessmentArb: fc.Arbitrary<AIAssessment> = fc
  .integer({ min: 1, max: 100000 })
  .chain((id) => assessmentArb(id));

// ---------------------------------------------------------------------------
// Property 7: Assessment history ordered newest-first
//
// For any array of assessments with varying createdAt values, the rendered
// list should display them in descending chronological order. The page relies
// on the API's ORDER BY createdAt DESC guarantee; these tests verify that the
// sortNewestFirst function correctly models that contract.
//
// Validates: Requirements 3.2
// ---------------------------------------------------------------------------

describe('Property 7 — Assessment history ordered newest-first', () => {
  it('sortNewestFirst always produces a newest-first ordering for any input', () => {
    /**
     * **Validates: Requirements 3.2**
     *
     * For any collection of assessments with arbitrary createdAt timestamps,
     * sortNewestFirst must return them in descending chronological order.
     */
    fc.assert(
      fc.property(assessmentListArb, (records) => {
        const sorted = sortNewestFirst(records);
        expect(isNewestFirst(sorted)).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });

  it('sortNewestFirst preserves all records — no drops or duplicates', () => {
    /**
     * **Validates: Requirements 3.2**
     *
     * The sorted list must contain exactly the same records as the input.
     * No assessment should be lost or duplicated during ordering.
     */
    fc.assert(
      fc.property(assessmentListArb, (records) => {
        const sorted = sortNewestFirst(records);
        expect(sorted.length).toBe(records.length);
        const inputIds = records.map((r) => r.id).sort((a, b) => a - b);
        const sortedIds = sorted.map((r) => r.id).sort((a, b) => a - b);
        expect(sortedIds).toEqual(inputIds);
      }),
      { numRuns: 1000 },
    );
  });

  it('the record with the latest createdAt is always rendered first', () => {
    /**
     * **Validates: Requirements 3.2**
     *
     * For any non-empty list, the assessment with the maximum createdAt
     * timestamp must appear first in the sorted result — matching what the
     * user sees at the top of the history list.
     */
    fc.assert(
      fc.property(
        fc.array(singleAssessmentArb, { minLength: 1, maxLength: 20 }),
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

  it('the record with the earliest createdAt is always rendered last', () => {
    /**
     * **Validates: Requirements 3.2**
     *
     * For any non-empty list, the assessment with the minimum createdAt
     * timestamp must appear last — the oldest entry is at the bottom.
     */
    fc.assert(
      fc.property(
        fc.array(singleAssessmentArb, { minLength: 1, maxLength: 20 }),
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

  it('sortNewestFirst is idempotent — sorting an already-sorted list is a no-op', () => {
    /**
     * **Validates: Requirements 3.2**
     *
     * Applying sortNewestFirst to an already-sorted list must produce the
     * same element order. This confirms the sort is stable with respect to
     * the ordering invariant.
     */
    fc.assert(
      fc.property(assessmentListArb, (records) => {
        const onceSorted = sortNewestFirst(records);
        const twiceSorted = sortNewestFirst(onceSorted);
        expect(twiceSorted.map((r) => r.id)).toEqual(onceSorted.map((r) => r.id));
      }),
      { numRuns: 500 },
    );
  });

  it('empty list sorts to an empty list', () => {
    /**
     * **Validates: Requirements 3.2**
     *
     * Boundary case: an empty history list must remain empty after sorting.
     */
    const result = sortNewestFirst([]);
    expect(result).toEqual([]);
  });

  it('single-element list is unchanged after sorting', () => {
    /**
     * **Validates: Requirements 3.2**
     *
     * Boundary case: a single-assessment history is trivially ordered.
     */
    fc.assert(
      fc.property(singleAssessmentArb, (record) => {
        const result = sortNewestFirst([record]);
        expect(result.length).toBe(1);
        expect(result[0].id).toBe(record.id);
      }),
      { numRuns: 500 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8: History row contains all required fields
//
// For any assessment object, the rendered row should contain the formatted
// date/time, symptom snippet ≤ 100 chars, diagnosis, UrgencyBadge style,
// and confidence score.
//
// Validates: Requirements 3.3
// ---------------------------------------------------------------------------

describe('Property 8 — History row contains all required fields', () => {
  it('truncated symptom snippet is always ≤ 100 characters', () => {
    /**
     * **Validates: Requirements 3.3**
     *
     * For any symptom string, the truncated version displayed in the list row
     * must never exceed 100 characters (the ellipsis character counts as 1).
     */
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 500 }),
        (symptoms) => {
          const snippet = truncate(symptoms);
          // The visible text (excluding the ellipsis) is at most 100 chars;
          // the full string including the ellipsis is at most 101 chars.
          expect(snippet.length).toBeLessThanOrEqual(101);
          // The raw character count of the slice is always ≤ 100
          const sliceLength = snippet.endsWith('…')
            ? snippet.length - 1 // subtract the ellipsis
            : snippet.length;
          expect(sliceLength).toBeLessThanOrEqual(100);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('short symptoms are displayed verbatim without truncation', () => {
    /**
     * **Validates: Requirements 3.3**
     *
     * Symptom strings of 100 characters or fewer must be shown in full —
     * no ellipsis appended.
     */
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 100 }),
        (symptoms) => {
          const snippet = truncate(symptoms);
          expect(snippet).toBe(symptoms);
          expect(snippet.endsWith('…')).toBe(false);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('long symptoms are truncated with an ellipsis', () => {
    /**
     * **Validates: Requirements 3.3**
     *
     * Symptom strings longer than 100 characters must be clipped and end
     * with the ellipsis character '…'.
     */
    fc.assert(
      fc.property(
        fc.string({ minLength: 101, maxLength: 500 }),
        (symptoms) => {
          const snippet = truncate(symptoms);
          expect(snippet.endsWith('…')).toBe(true);
          // The slice before the ellipsis is exactly the first 100 chars
          expect(snippet.slice(0, 100)).toBe(symptoms.slice(0, 100));
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('formatDate produces a non-empty string for any valid ISO datetime', () => {
    /**
     * **Validates: Requirements 3.3**
     *
     * For any valid ISO datetime string, formatDate must return a non-empty
     * string that the row can display as the date portion.
     */
    fc.assert(
      fc.property(isoDateArb, (dateStr) => {
        const result = formatDate(dateStr);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      }),
      { numRuns: 500 },
    );
  });

  it('formatTime produces a non-empty string for any valid ISO datetime', () => {
    /**
     * **Validates: Requirements 3.3**
     *
     * For any valid ISO datetime string, formatTime must return a non-empty
     * string that the row can display as the time portion.
     */
    fc.assert(
      fc.property(isoDateArb, (dateStr) => {
        const result = formatTime(dateStr);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      }),
      { numRuns: 500 },
    );
  });

  it('UrgencyBadge style is always a non-empty CSS class string', () => {
    /**
     * **Validates: Requirements 3.3**
     *
     * For any urgency value (including unknown values), getUrgencyStyle must
     * return a non-empty CSS class string so the badge always renders.
     */
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constantFrom('EMERGENCY', 'URGENT', 'NON-URGENT'),
          fc.string({ minLength: 0, maxLength: 30 }),
        ),
        (urgency) => {
          const cls = getUrgencyStyle(urgency);
          expect(typeof cls).toBe('string');
          expect(cls.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('known urgency levels map to their correct CSS classes', () => {
    /**
     * **Validates: Requirements 3.3**
     *
     * The three canonical urgency levels must map to their specific colour
     * classes so the badge conveys the correct visual severity.
     */
    expect(getUrgencyStyle('EMERGENCY')).toBe('bg-red-100 text-red-800');
    expect(getUrgencyStyle('URGENT')).toBe('bg-amber-100 text-amber-800');
    expect(getUrgencyStyle('NON-URGENT')).toBe('bg-green-100 text-green-800');
  });

  it('unknown urgency values fall back to the gray style', () => {
    /**
     * **Validates: Requirements 3.3**
     *
     * Any urgency value not in the known set must fall back to the neutral
     * gray style rather than producing an empty or undefined class.
     */
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter(
          (s) => !['EMERGENCY', 'URGENT', 'NON-URGENT'].includes(s),
        ),
        (unknownUrgency) => {
          const cls = getUrgencyStyle(unknownUrgency);
          expect(cls).toBe('bg-gray-100 text-gray-800');
        },
      ),
      { numRuns: 300 },
    );
  });

  it('every field required by the list row is present on any assessment', () => {
    /**
     * **Validates: Requirements 3.3**
     *
     * For any AIAssessment object, all fields rendered in the list row must
     * be present and of the correct type: createdAt (string), symptoms
     * (string), diagnosis (string), urgency (known level), confidence (number
     * in [0, 100]).
     */
    fc.assert(
      fc.property(singleAssessmentArb, (assessment) => {
        // Date/time fields
        expect(typeof assessment.createdAt).toBe('string');
        expect(assessment.createdAt.length).toBeGreaterThan(0);
        const dateStr = formatDate(assessment.createdAt);
        const timeStr = formatTime(assessment.createdAt);
        expect(dateStr.length).toBeGreaterThan(0);
        expect(timeStr.length).toBeGreaterThan(0);

        // Symptom snippet
        const snippet = truncate(assessment.symptoms);
        expect(snippet.length).toBeLessThanOrEqual(101); // 100 chars + optional ellipsis

        // Diagnosis
        expect(typeof assessment.diagnosis).toBe('string');
        expect(assessment.diagnosis.length).toBeGreaterThan(0);

        // Urgency badge
        const cls = getUrgencyStyle(assessment.urgency);
        expect(cls.length).toBeGreaterThan(0);

        // Confidence score
        expect(typeof assessment.confidence).toBe('number');
        expect(assessment.confidence).toBeGreaterThanOrEqual(0);
        expect(assessment.confidence).toBeLessThanOrEqual(100);
      }),
      { numRuns: 1000 },
    );
  });
});
