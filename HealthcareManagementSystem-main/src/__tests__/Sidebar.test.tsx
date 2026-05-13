/**
 * Property-based tests for Sidebar active navigation item logic.
 *
 * The Sidebar component uses `useLocation()` from react-router-dom to
 * determine which navigation item is active, then applies CSS classes
 * accordingly. Because the test environment is Node (no DOM / jsdom), these
 * tests model the component's pure logic as standalone functions — the same
 * approach used throughout this test suite (see SymptomCheckerPage.test.tsx,
 * SymptomCheckerHistoryPage.test.tsx, etc.).
 *
 * The functions mirrored here are:
 *   - isActive(pathname, itemPath)     — exact-match check from Sidebar.tsx
 *   - getItemClassName(isActive)       — CSS class selector from Sidebar.tsx
 *
 * Validates: Requirements 7.3
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Pure function mirrors (from Sidebar.tsx)
// ---------------------------------------------------------------------------

/**
 * Determine whether a sidebar item is active for the given pathname.
 * Mirrors the `isActive` logic in Sidebar.tsx:
 *   const isActive = location.pathname === item.path;
 */
function isActive(pathname: string, itemPath: string): boolean {
  return pathname === itemPath;
}

/**
 * Return the CSS class string for a sidebar item based on its active state.
 * Mirrors the className ternary in Sidebar.tsx:
 *   isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
 */
function getItemClassName(active: boolean): string {
  return active
    ? 'bg-blue-50 text-blue-700'
    : 'text-gray-700 hover:bg-gray-50';
}

// ---------------------------------------------------------------------------
// Sidebar items relevant to symcheck (mirrored from Sidebar.tsx)
// ---------------------------------------------------------------------------

interface SidebarItem {
  title: string;
  path: string;
  roles: string[];
}

const SYMCHECK_ITEMS: SidebarItem[] = [
  { title: 'Symptom Checker', path: '/symcheck', roles: ['patient'] },
  { title: 'AI Analytics', path: '/symcheck/dashboard', roles: ['admin', 'doctor'] },
];

const SYMCHECK_PATHS = SYMCHECK_ITEMS.map((item) => item.path);

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for one of the exact symcheck item paths. */
const symcheckPathArb = fc.constantFrom(...SYMCHECK_PATHS);

/** Arbitrary for a path that is NOT one of the symcheck item paths. */
const nonSymcheckPathArb = fc
  .string({ minLength: 1, maxLength: 80 })
  .filter((s) => s.startsWith('/') && !SYMCHECK_PATHS.includes(s));

/** Arbitrary for any path string (may or may not be a symcheck path). */
const anyPathArb = fc.oneof(
  symcheckPathArb,
  nonSymcheckPathArb,
);

// ---------------------------------------------------------------------------
// Property 16: Active sidebar item for /symcheck routes
//
// For any `/symcheck` route path, the corresponding sidebar navigation item
// should have `bg-blue-50 text-blue-700` applied.
//
// Validates: Requirements 7.3
// ---------------------------------------------------------------------------

describe('Property 16 — Active sidebar item for /symcheck routes', () => {
  it('/symcheck path activates the Symptom Checker item with bg-blue-50 text-blue-700', () => {
    /**
     * **Validates: Requirements 7.3**
     *
     * When the current pathname is exactly `/symcheck`, the "Symptom Checker"
     * sidebar item must be active and receive the `bg-blue-50 text-blue-700`
     * CSS classes.
     */
    const symptomCheckerItem = SYMCHECK_ITEMS.find((i) => i.path === '/symcheck')!;
    const active = isActive('/symcheck', symptomCheckerItem.path);
    const className = getItemClassName(active);

    expect(active).toBe(true);
    expect(className).toBe('bg-blue-50 text-blue-700');
  });

  it('/symcheck/dashboard path activates the AI Analytics item with bg-blue-50 text-blue-700', () => {
    /**
     * **Validates: Requirements 7.3**
     *
     * When the current pathname is exactly `/symcheck/dashboard`, the
     * "AI Analytics" sidebar item must be active and receive the
     * `bg-blue-50 text-blue-700` CSS classes.
     */
    const aiAnalyticsItem = SYMCHECK_ITEMS.find((i) => i.path === '/symcheck/dashboard')!;
    const active = isActive('/symcheck/dashboard', aiAnalyticsItem.path);
    const className = getItemClassName(active);

    expect(active).toBe(true);
    expect(className).toBe('bg-blue-50 text-blue-700');
  });

  it('non-symcheck paths do NOT apply active classes to any symcheck item', () => {
    /**
     * **Validates: Requirements 7.3**
     *
     * For any path that is not one of the symcheck item paths, no symcheck
     * sidebar item should receive the `bg-blue-50 text-blue-700` active classes.
     */
    fc.assert(
      fc.property(nonSymcheckPathArb, (pathname) => {
        for (const item of SYMCHECK_ITEMS) {
          const active = isActive(pathname, item.path);
          const className = getItemClassName(active);

          expect(active).toBe(false);
          expect(className).not.toBe('bg-blue-50 text-blue-700');
          expect(className).toBe('text-gray-700 hover:bg-gray-50');
        }
      }),
      { numRuns: 500 },
    );
  });

  it('active class string is always exactly bg-blue-50 text-blue-700 — never partial', () => {
    /**
     * **Validates: Requirements 7.3**
     *
     * When a symcheck item is active, the returned class string must be the
     * complete, exact value `bg-blue-50 text-blue-700` — not a partial match
     * or a superset with extra classes.
     */
    fc.assert(
      fc.property(symcheckPathArb, (pathname) => {
        const matchingItem = SYMCHECK_ITEMS.find((i) => i.path === pathname)!;
        const active = isActive(pathname, matchingItem.path);
        const className = getItemClassName(active);

        expect(active).toBe(true);
        expect(className).toBe('bg-blue-50 text-blue-700');
        // Must be the exact string — not a superset
        expect(className.split(' ')).toHaveLength(2);
        expect(className.split(' ')).toContain('bg-blue-50');
        expect(className.split(' ')).toContain('text-blue-700');
      }),
      { numRuns: SYMCHECK_PATHS.length * 50 },
    );
  });

  it('non-active items always get text-gray-700 hover:bg-gray-50', () => {
    /**
     * **Validates: Requirements 7.3**
     *
     * For any path that does not exactly match a symcheck item's path, that
     * item must receive the inactive class string `text-gray-700 hover:bg-gray-50`.
     */
    fc.assert(
      fc.property(anyPathArb, (pathname) => {
        for (const item of SYMCHECK_ITEMS) {
          const active = isActive(pathname, item.path);
          const className = getItemClassName(active);

          if (!active) {
            expect(className).toBe('text-gray-700 hover:bg-gray-50');
          }
        }
      }),
      { numRuns: 500 },
    );
  });

  it('for any exact symcheck item path, that item is active and no other symcheck item is active simultaneously (mutual exclusivity)', () => {
    /**
     * **Validates: Requirements 7.3**
     *
     * For any path that exactly matches one symcheck sidebar item, exactly
     * one item must be active and all other symcheck items must be inactive.
     * Two symcheck items cannot be active at the same time because the
     * isActive check is an exact-match equality test.
     */
    fc.assert(
      fc.property(symcheckPathArb, (pathname) => {
        const activeItems = SYMCHECK_ITEMS.filter((item) =>
          isActive(pathname, item.path),
        );

        // Exactly one item is active
        expect(activeItems).toHaveLength(1);

        // That item's class is the active class
        const activeClassName = getItemClassName(true);
        expect(activeClassName).toBe('bg-blue-50 text-blue-700');

        // All other items are inactive
        const inactiveItems = SYMCHECK_ITEMS.filter(
          (item) => !isActive(pathname, item.path),
        );
        for (const item of inactiveItems) {
          const className = getItemClassName(isActive(pathname, item.path));
          expect(className).toBe('text-gray-700 hover:bg-gray-50');
        }
      }),
      { numRuns: SYMCHECK_PATHS.length * 50 },
    );
  });
});
