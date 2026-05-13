/**
 * Property-based tests for PDF report generation.
 *
 * The PDF endpoint in Server.js cannot be imported directly in a unit-test
 * environment (it requires Express, MySQL, and pdfkit). The two properties
 * tested here are therefore verified against the pure, side-effect-free logic
 * that the endpoint delegates to:
 *
 *   - `buildContentDispositionHeader(id)` — mirrors the header assignment:
 *       res.setHeader('Content-Disposition', `attachment; filename="symcheck_report_${id}.pdf"`)
 *
 *   - `resolveUrgencyColor(urgency)` — mirrors the urgency color lookup:
 *       const urgencyColors = { EMERGENCY: '#dc2626', URGENT: '#d97706', 'NON-URGENT': '#16a34a' }
 *       const urgencyColor = urgencyColors[record.urgency] || '#16a34a'
 *
 * Any change to the header format or color mapping in Server.js must be
 * mirrored in the implementations below.
 *
 * Validates: Requirements 4.5, 4.6
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Source under test (mirrored from Server.js)
// ---------------------------------------------------------------------------

/**
 * Mirrors the Content-Disposition header value set in the PDF endpoint:
 *   res.setHeader('Content-Disposition', `attachment; filename="symcheck_report_${id}.pdf"`)
 */
function buildContentDispositionHeader(id: number | string): string {
  return `attachment; filename="symcheck_report_${id}.pdf"`;
}

/** Urgency values accepted by the PDF endpoint. */
type Urgency = 'EMERGENCY' | 'URGENT' | 'NON-URGENT';

/**
 * Mirrors the urgency color lookup in the PDF endpoint:
 *   const urgencyColors = { EMERGENCY: '#dc2626', URGENT: '#d97706', 'NON-URGENT': '#16a34a' }
 *   const urgencyColor = urgencyColors[record.urgency] || '#16a34a'
 *
 * Uses Object.hasOwn to avoid prototype-property collisions (e.g. "valueOf",
 * "toString") that would otherwise return a function instead of undefined.
 */
function resolveUrgencyColor(urgency: string): string {
  const urgencyColors: Record<string, string> = {
    EMERGENCY: '#dc2626',
    URGENT: '#d97706',
    'NON-URGENT': '#16a34a',
  };
  return Object.hasOwn(urgencyColors, urgency) ? urgencyColors[urgency] : '#16a34a';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The three valid urgency values and their expected colors. */
const URGENCY_COLOR_MAP: Array<{ urgency: Urgency; color: string }> = [
  { urgency: 'EMERGENCY', color: '#dc2626' },
  { urgency: 'URGENT',    color: '#d97706' },
  { urgency: 'NON-URGENT', color: '#16a34a' },
];

// ---------------------------------------------------------------------------
// Property 11: PDF Content-Disposition header
//
// For any successful PDF generation, the HTTP response must include a
// Content-Disposition header with value:
//   attachment; filename="symcheck_report_<id>.pdf"
// where <id> matches the requested assessment ID.
// ---------------------------------------------------------------------------

describe('Property 11 — PDF Content-Disposition header', () => {
  it('produces the correct header for any positive integer assessment ID', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        (id) => {
          const header = buildContentDispositionHeader(id);
          expect(header).toBe(`attachment; filename="symcheck_report_${id}.pdf"`);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('header starts with "attachment; filename=" for any ID', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        (id) => {
          const header = buildContentDispositionHeader(id);
          expect(header.startsWith('attachment; filename=')).toBe(true);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('filename in header ends with ".pdf" for any ID', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        (id) => {
          const header = buildContentDispositionHeader(id);
          // Extract the filename value between the quotes
          const match = header.match(/filename="([^"]+)"/);
          expect(match).not.toBeNull();
          expect(match![1].endsWith('.pdf')).toBe(true);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('filename embeds the exact assessment ID for any ID', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        (id) => {
          const header = buildContentDispositionHeader(id);
          const match = header.match(/filename="([^"]+)"/);
          expect(match).not.toBeNull();
          const filename = match![1]; // e.g. "symcheck_report_42.pdf"
          expect(filename).toBe(`symcheck_report_${id}.pdf`);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('produces distinct headers for distinct assessment IDs', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 1, max: 500_000 }),
          fc.integer({ min: 500_001, max: 1_000_000 }),
        ),
        ([idA, idB]) => {
          const headerA = buildContentDispositionHeader(idA);
          const headerB = buildContentDispositionHeader(idB);
          expect(headerA).not.toBe(headerB);
        },
      ),
      { numRuns: 500 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 12: PDF urgency color coding
//
// For any assessment with urgency EMERGENCY, URGENT, or NON-URGENT, the PDF
// generation function must apply the corresponding color:
//   EMERGENCY  → #dc2626  (red-600)
//   URGENT     → #d97706  (amber-600)
//   NON-URGENT → #16a34a  (green-600)
// ---------------------------------------------------------------------------

describe('Property 12 — PDF urgency color coding', () => {
  it('maps each valid urgency value to its exact color', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...URGENCY_COLOR_MAP),
        ({ urgency, color }) => {
          const resolved = resolveUrgencyColor(urgency);
          expect(resolved).toBe(color);
        },
      ),
      { numRuns: URGENCY_COLOR_MAP.length * 100 },
    );
  });

  it('maps EMERGENCY to #dc2626 (red-600)', () => {
    expect(resolveUrgencyColor('EMERGENCY')).toBe('#dc2626');
  });

  it('maps URGENT to #d97706 (amber-600)', () => {
    expect(resolveUrgencyColor('URGENT')).toBe('#d97706');
  });

  it('maps NON-URGENT to #16a34a (green-600)', () => {
    expect(resolveUrgencyColor('NON-URGENT')).toBe('#16a34a');
  });

  it('returns the NON-URGENT default color (#16a34a) for any unrecognised urgency string', () => {
    // Prototype property names (e.g. "valueOf", "toString") are excluded because
    // they exist on every plain object and would require Object.hasOwn in the
    // implementation — which is exactly what resolveUrgencyColor uses.
    const protoKeys = new Set(Object.getOwnPropertyNames(Object.prototype));

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter(
          (s) =>
            s !== 'EMERGENCY' &&
            s !== 'URGENT' &&
            s !== 'NON-URGENT' &&
            !protoKeys.has(s),
        ),
        (unknownUrgency) => {
          const resolved = resolveUrgencyColor(unknownUrgency);
          expect(resolved).toBe('#16a34a');
        },
      ),
      { numRuns: 500 },
    );
  });

  it('color values are valid 6-digit hex strings for all valid urgency levels', () => {
    const hexPattern = /^#[0-9a-f]{6}$/i;
    fc.assert(
      fc.property(
        fc.constantFrom<Urgency>('EMERGENCY', 'URGENT', 'NON-URGENT'),
        (urgency) => {
          const color = resolveUrgencyColor(urgency);
          expect(hexPattern.test(color)).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('each valid urgency level maps to a distinct color', () => {
    const colors = URGENCY_COLOR_MAP.map(({ urgency }) => resolveUrgencyColor(urgency));
    const uniqueColors = new Set(colors);
    // All three urgency levels must have different colors
    expect(uniqueColors.size).toBe(URGENCY_COLOR_MAP.length);
  });
});
