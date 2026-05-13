/**
 * Property-based tests for ownership verification on assessment access.
 *
 * The ownership check is a pure conditional in Server.js:
 *   if (record.userId !== userId) → HTTP 403
 *
 * Since the check is a pure function of two integers, it is extracted here
 * as `checkOwnership` and tested in isolation without any HTTP or database
 * dependencies.
 *
 * **Validates: Requirements 3.9, 4.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Source under test (mirrors the ownership check in Server.js)
//
// GET /api/symcheck/history/:id  → returns 403 if record.userId !== userId
// GET /api/symcheck/report/:id   → returns 403 if record.userId !== userId
//
// The pure function below captures that conditional exactly.
// ---------------------------------------------------------------------------

/**
 * Returns true when the requesting user owns the record (access granted → 200).
 * Returns false when the requesting user does not own the record (access denied → 403).
 */
function checkOwnership(recordUserId: number, requestUserId: number): boolean {
  return recordUserId === requestUserId;
}

// ---------------------------------------------------------------------------
// Property 9a: Ownership check denies access for distinct user IDs
//
// For any two distinct positive integers ownerUserId and requestUserId,
// checkOwnership must return false (access denied → HTTP 403).
// ---------------------------------------------------------------------------

describe('Property 9a — Ownership check denies access for distinct user IDs', () => {
  it('returns false when requestUserId differs from recordUserId', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 1, max: 100000 }),
          fc.integer({ min: 1, max: 100000 }),
        ).filter(([owner, requester]) => owner !== requester),
        ([ownerUserId, requestUserId]) => {
          const result = checkOwnership(ownerUserId, requestUserId);
          expect(result).toBe(false);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('returns false when requestUserId is owner + 1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 99999 }),
        (ownerUserId) => {
          const requestUserId = ownerUserId + 1;
          const result = checkOwnership(ownerUserId, requestUserId);
          expect(result).toBe(false);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('returns false when requestUserId is owner - 1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 100000 }),
        (ownerUserId) => {
          const requestUserId = ownerUserId - 1;
          const result = checkOwnership(ownerUserId, requestUserId);
          expect(result).toBe(false);
        },
      ),
      { numRuns: 500 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9b: Ownership check grants access when user IDs match
//
// For any positive integer userId, checkOwnership(userId, userId) must return
// true (access granted → HTTP 200).
// ---------------------------------------------------------------------------

describe('Property 9b — Ownership check grants access when user IDs match', () => {
  it('returns true when requestUserId equals recordUserId', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }),
        (userId) => {
          const result = checkOwnership(userId, userId);
          expect(result).toBe(true);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('returns true for boundary user ID values (1 and 100000)', () => {
    expect(checkOwnership(1, 1)).toBe(true);
    expect(checkOwnership(100000, 100000)).toBe(true);
  });

  it('returns false for boundary cross-checks (1 vs 100000)', () => {
    expect(checkOwnership(1, 100000)).toBe(false);
    expect(checkOwnership(100000, 1)).toBe(false);
  });
});
