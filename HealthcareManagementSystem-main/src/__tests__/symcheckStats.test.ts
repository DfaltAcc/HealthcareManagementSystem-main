/**
 * Property-based tests for stats aggregation logic.
 *
 * The GET /api/symcheck/stats endpoint runs three SQL queries:
 *   1. SELECT COUNT(*) as total FROM ai_assessments
 *   2. SELECT urgency, COUNT(*) as count FROM ai_assessments GROUP BY urgency
 *   3. SELECT DATE(createdAt) as date, AVG(confidence) as confidence
 *      FROM ai_assessments GROUP BY DATE(createdAt) ORDER BY date ASC
 *
 * The aggregation logic is mirrored here as pure TypeScript functions so the
 * properties can be verified in isolation without any HTTP or database
 * dependencies.
 *
 * **Validates: Requirements 5.6**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AssessmentRecord {
  id: number;
  userId: number;
  createdAt: string; // ISO-8601 datetime string, e.g. "2024-03-15T10:30:00.000Z"
  urgency: 'EMERGENCY' | 'URGENT' | 'NON-URGENT';
  confidence: number; // 0–100
}

// ---------------------------------------------------------------------------
// Pure functions mirroring the SQL queries in Server.js stats endpoint
// ---------------------------------------------------------------------------

/**
 * Mirror of: SELECT COUNT(*) as total FROM ai_assessments
 */
function computeTotalAssessments(records: AssessmentRecord[]): number {
  return records.length;
}

/**
 * Mirror of: SELECT urgency, COUNT(*) as count FROM ai_assessments GROUP BY urgency
 */
function computeUrgencyCounts(
  records: AssessmentRecord[],
): { EMERGENCY: number; URGENT: number; NON_URGENT: number } {
  return {
    EMERGENCY: records.filter((r) => r.urgency === 'EMERGENCY').length,
    URGENT: records.filter((r) => r.urgency === 'URGENT').length,
    NON_URGENT: records.filter((r) => r.urgency === 'NON-URGENT').length,
  };
}

/**
 * Mirror of:
 *   SELECT DATE(createdAt) as date, AVG(confidence) as confidence
 *   FROM ai_assessments GROUP BY DATE(createdAt) ORDER BY date ASC
 */
function computeConfidenceTrend(
  records: AssessmentRecord[],
): Array<{ date: string; confidence: number }> {
  const groups = new Map<string, number[]>();
  for (const r of records) {
    const date = r.createdAt.slice(0, 10); // "YYYY-MM-DD"
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date)!.push(r.confidence);
  }
  return [...groups.entries()]
    .map(([date, confidences]) => ({
      date,
      confidence: confidences.reduce((sum, c) => sum + c, 0) / confidences.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const MIN_MS = new Date('2000-01-01T00:00:00.000Z').getTime();
const MAX_MS = new Date('2099-12-31T23:59:59.999Z').getTime();

/** ISO-8601 datetime string within a realistic range. */
const isoDateArb = fc
  .integer({ min: MIN_MS, max: MAX_MS })
  .map((ms) => new Date(ms).toISOString());

/** A single assessment record with arbitrary field values. */
const assessmentArb = fc.record({
  id: fc.integer({ min: 1, max: 100000 }),
  userId: fc.integer({ min: 1, max: 100000 }),
  createdAt: isoDateArb,
  urgency: fc.constantFrom('EMERGENCY', 'URGENT', 'NON-URGENT') as fc.Arbitrary<
    'EMERGENCY' | 'URGENT' | 'NON-URGENT'
  >,
  confidence: fc.float({ min: 0, max: 100, noNaN: true }),
});

/** Array of 0–20 assessment records. */
const assessmentListArb = fc.array(assessmentArb, { minLength: 0, maxLength: 20 });

// ---------------------------------------------------------------------------
// Property 13a: totalAssessments equals record count
//
// For any array of assessment records, computeTotalAssessments must equal
// records.length.
//
// **Validates: Requirements 5.6**
// ---------------------------------------------------------------------------

describe('Property 13a — totalAssessments equals record count', () => {
  it('returns records.length for any input array', () => {
    fc.assert(
      fc.property(assessmentListArb, (records) => {
        const total = computeTotalAssessments(records);
        expect(total).toBe(records.length);
      }),
      { numRuns: 1000 },
    );
  });

  it('returns 0 for an empty array', () => {
    expect(computeTotalAssessments([])).toBe(0);
  });

  it('returns 1 for a single-element array', () => {
    fc.assert(
      fc.property(assessmentArb, (record) => {
        expect(computeTotalAssessments([record])).toBe(1);
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13b: urgencyCounts entries sum to totalAssessments
//
// For any array of assessment records, EMERGENCY + URGENT + NON_URGENT must
// equal records.length.
//
// **Validates: Requirements 5.6**
// ---------------------------------------------------------------------------

describe('Property 13b — urgencyCounts entries sum to totalAssessments', () => {
  it('sum of all urgency counts equals total record count', () => {
    fc.assert(
      fc.property(assessmentListArb, (records) => {
        const counts = computeUrgencyCounts(records);
        const sum = counts.EMERGENCY + counts.URGENT + counts.NON_URGENT;
        expect(sum).toBe(records.length);
      }),
      { numRuns: 1000 },
    );
  });

  it('all counts are zero for an empty array', () => {
    const counts = computeUrgencyCounts([]);
    expect(counts.EMERGENCY).toBe(0);
    expect(counts.URGENT).toBe(0);
    expect(counts.NON_URGENT).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Property 13c: urgencyCounts per-urgency accuracy
//
// For any array of assessment records, each urgency count must equal the
// number of records with that urgency value.
//
// **Validates: Requirements 5.6**
// ---------------------------------------------------------------------------

describe('Property 13c — urgencyCounts per-urgency accuracy', () => {
  it('EMERGENCY count matches filtered record count', () => {
    fc.assert(
      fc.property(assessmentListArb, (records) => {
        const counts = computeUrgencyCounts(records);
        const expected = records.filter((r) => r.urgency === 'EMERGENCY').length;
        expect(counts.EMERGENCY).toBe(expected);
      }),
      { numRuns: 500 },
    );
  });

  it('URGENT count matches filtered record count', () => {
    fc.assert(
      fc.property(assessmentListArb, (records) => {
        const counts = computeUrgencyCounts(records);
        const expected = records.filter((r) => r.urgency === 'URGENT').length;
        expect(counts.URGENT).toBe(expected);
      }),
      { numRuns: 500 },
    );
  });

  it('NON_URGENT count matches filtered record count', () => {
    fc.assert(
      fc.property(assessmentListArb, (records) => {
        const counts = computeUrgencyCounts(records);
        const expected = records.filter((r) => r.urgency === 'NON-URGENT').length;
        expect(counts.NON_URGENT).toBe(expected);
      }),
      { numRuns: 500 },
    );
  });

  it('all records same urgency — that count equals total, others are 0', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('EMERGENCY' as const, 'URGENT' as const, 'NON-URGENT' as const),
        fc.array(assessmentArb, { minLength: 1, maxLength: 20 }),
        (urgency, baseRecords) => {
          const records = baseRecords.map((r) => ({ ...r, urgency }));
          const counts = computeUrgencyCounts(records);
          if (urgency === 'EMERGENCY') {
            expect(counts.EMERGENCY).toBe(records.length);
            expect(counts.URGENT).toBe(0);
            expect(counts.NON_URGENT).toBe(0);
          } else if (urgency === 'URGENT') {
            expect(counts.EMERGENCY).toBe(0);
            expect(counts.URGENT).toBe(records.length);
            expect(counts.NON_URGENT).toBe(0);
          } else {
            expect(counts.EMERGENCY).toBe(0);
            expect(counts.URGENT).toBe(0);
            expect(counts.NON_URGENT).toBe(records.length);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13d: confidenceTrend is ordered by date ascending
//
// For any array of assessment records, computeConfidenceTrend must return
// entries in ascending date order.
//
// **Validates: Requirements 5.6**
// ---------------------------------------------------------------------------

describe('Property 13d — confidenceTrend is ordered by date ascending', () => {
  it('result dates are in ascending order for any input', () => {
    fc.assert(
      fc.property(assessmentListArb, (records) => {
        const trend = computeConfidenceTrend(records);
        for (let i = 0; i < trend.length - 1; i++) {
          expect(trend[i].date.localeCompare(trend[i + 1].date)).toBeLessThanOrEqual(0);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('empty input produces empty trend', () => {
    expect(computeConfidenceTrend([])).toEqual([]);
  });

  it('single record produces a single-entry trend', () => {
    fc.assert(
      fc.property(assessmentArb, (record) => {
        const trend = computeConfidenceTrend([record]);
        expect(trend.length).toBe(1);
        expect(trend[0].date).toBe(record.createdAt.slice(0, 10));
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13e: confidenceTrend date grouping correctness
//
// For any array of assessment records, each entry in confidenceTrend must
// correspond to a unique date, and the confidence value must be the average
// of all records on that date.
//
// **Validates: Requirements 5.6**
// ---------------------------------------------------------------------------

describe('Property 13e — confidenceTrend date grouping correctness', () => {
  it('each date appears exactly once in the trend', () => {
    fc.assert(
      fc.property(assessmentListArb, (records) => {
        const trend = computeConfidenceTrend(records);
        const dates = trend.map((e) => e.date);
        const uniqueDates = new Set(dates);
        expect(uniqueDates.size).toBe(dates.length);
      }),
      { numRuns: 500 },
    );
  });

  it('confidence value equals the average of all records on that date', () => {
    fc.assert(
      fc.property(assessmentListArb, (records) => {
        const trend = computeConfidenceTrend(records);
        for (const entry of trend) {
          const dateRecords = records.filter(
            (r) => r.createdAt.slice(0, 10) === entry.date,
          );
          const expectedAvg =
            dateRecords.reduce((sum, r) => sum + r.confidence, 0) / dateRecords.length;
          expect(entry.confidence).toBeCloseTo(expectedAvg, 5);
        }
      }),
      { numRuns: 500 },
    );
  });

  it('all records same date — trend has exactly one entry with the average confidence', () => {
    fc.assert(
      fc.property(
        fc.array(assessmentArb, { minLength: 1, maxLength: 20 }),
        (baseRecords) => {
          // Force all records to the same date
          const fixedDate = '2025-06-15T12:00:00.000Z';
          const records = baseRecords.map((r) => ({ ...r, createdAt: fixedDate }));
          const trend = computeConfidenceTrend(records);
          expect(trend.length).toBe(1);
          expect(trend[0].date).toBe('2025-06-15');
          const expectedAvg =
            records.reduce((sum, r) => sum + r.confidence, 0) / records.length;
          expect(trend[0].confidence).toBeCloseTo(expectedAvg, 5);
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13f: confidenceTrend contains only dates present in the input
//
// For any array of assessment records, every date in confidenceTrend must
// appear in the input records' createdAt values.
//
// **Validates: Requirements 5.6**
// ---------------------------------------------------------------------------

describe('Property 13f — confidenceTrend contains only dates present in the input', () => {
  it('every trend date appears in the input records', () => {
    fc.assert(
      fc.property(assessmentListArb, (records) => {
        const trend = computeConfidenceTrend(records);
        const inputDates = new Set(records.map((r) => r.createdAt.slice(0, 10)));
        for (const entry of trend) {
          expect(inputDates.has(entry.date)).toBe(true);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('trend has no more entries than distinct dates in the input', () => {
    fc.assert(
      fc.property(assessmentListArb, (records) => {
        const trend = computeConfidenceTrend(records);
        const distinctDates = new Set(records.map((r) => r.createdAt.slice(0, 10)));
        expect(trend.length).toBeLessThanOrEqual(distinctDates.size);
      }),
      { numRuns: 500 },
    );
  });

  it('trend entry count equals the number of distinct dates in the input', () => {
    fc.assert(
      fc.property(assessmentListArb, (records) => {
        const trend = computeConfidenceTrend(records);
        const distinctDates = new Set(records.map((r) => r.createdAt.slice(0, 10)));
        expect(trend.length).toBe(distinctDates.size);
      }),
      { numRuns: 500 },
    );
  });
});
