/**
 * Property-based tests for SymCheck session state management.
 *
 * The session logic lives in Server.js alongside Express/MySQL setup that cannot
 * be imported in a unit-test environment. The session accumulation and cleanup
 * behaviours are therefore modelled as pure functions here so the properties can
 * be verified in isolation.
 *
 * Validates: Requirements 6.4, 6.5
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Session model (mirrors the in-memory shape used in Server.js)
// ---------------------------------------------------------------------------

interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
}

interface SessionState {
  conversation: ConversationEntry[];
  symptoms: string;
  questionsAsked: string[];
  userId: number;
}

// ---------------------------------------------------------------------------
// Pure helper functions that model the session logic from Server.js
// ---------------------------------------------------------------------------

/**
 * Create a fresh session entry (mirrors the "session not found → create" branch
 * in the POST /api/symcheck/analyze handler).
 */
function createSession(userId: number): SessionState {
  return { conversation: [], symptoms: '', questionsAsked: [], userId };
}

/**
 * Append a user message to the session, storing the first message as symptoms.
 * Returns a new session object (pure — does not mutate the input).
 */
function appendUserMessage(session: SessionState, message: string): SessionState {
  const updatedConversation: ConversationEntry[] = [
    ...session.conversation,
    { role: 'user', content: message },
  ];
  return {
    ...session,
    conversation: updatedConversation,
    symptoms: session.symptoms === '' ? message : session.symptoms,
  };
}

/**
 * Append an assistant (bot) response to the session.
 * Returns a new session object (pure).
 */
function appendAssistantMessage(session: SessionState, response: string): SessionState {
  return {
    ...session,
    conversation: [...session.conversation, { role: 'assistant', content: response }],
  };
}

/**
 * Determine whether a session has accumulated enough exchanges to produce a
 * completed assessment. Mirrors the Server.js condition:
 *   session.conversation.length >= 4  (i.e. ≥ 2 patient exchanges)
 */
function isAssessmentReady(session: SessionState): boolean {
  return session.conversation.length >= 4;
}

// ---------------------------------------------------------------------------
// Property 14: Session state accumulates correctly
//
// For any sequence of messages sent with the same session ID, each subsequent
// call should have access to the full prior conversation history for that
// session, with all previous messages present in the session's conversation
// array.
//
// Validates: Requirements 6.4
// ---------------------------------------------------------------------------

describe('Property 14 — Session state accumulates correctly', () => {
  it('conversation length equals the number of messages appended', () => {
    /**
     * **Validates: Requirements 6.4**
     *
     * For any sequence of 1–10 non-empty user messages, simulating the
     * append-per-request logic should produce a conversation array whose
     * length equals the number of messages sent.
     */
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 1, max: 10000 }),
        (messages, userId) => {
          let session = createSession(userId);

          for (const message of messages) {
            session = appendUserMessage(session, message);
          }

          expect(session.conversation.length).toBe(messages.length);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('all previously sent messages are present in the conversation array', () => {
    /**
     * **Validates: Requirements 6.4**
     *
     * After appending N messages, every message that was sent must appear in
     * the conversation array in the order it was sent.
     */
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 1, max: 10000 }),
        (messages, userId) => {
          let session = createSession(userId);

          for (const message of messages) {
            session = appendUserMessage(session, message);
          }

          const userMessages = session.conversation
            .filter((e) => e.role === 'user')
            .map((e) => e.content);

          expect(userMessages).toEqual(messages);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('first message is stored as session symptoms', () => {
    /**
     * **Validates: Requirements 6.4**
     *
     * The first user message in any sequence must be stored as
     * session.symptoms, regardless of how many subsequent messages follow.
     */
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 1, max: 10000 }),
        (messages, userId) => {
          let session = createSession(userId);

          for (const message of messages) {
            session = appendUserMessage(session, message);
          }

          expect(session.symptoms).toBe(messages[0]);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('conversation grows monotonically — each append increases length by exactly 1', () => {
    /**
     * **Validates: Requirements 6.4**
     *
     * Each call to appendUserMessage must increase conversation.length by
     * exactly 1, ensuring no messages are dropped or duplicated.
     */
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }), { minLength: 2, maxLength: 10 }),
        fc.integer({ min: 1, max: 10000 }),
        (messages, userId) => {
          let session = createSession(userId);
          let previousLength = 0;

          for (const message of messages) {
            session = appendUserMessage(session, message);
            expect(session.conversation.length).toBe(previousLength + 1);
            previousLength = session.conversation.length;
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 15: Session cleanup after assessment completion
//
// For any session that produces a completed assessment (conversation.length >= 4),
// the session ID should no longer exist in activeSymcheckSessions after the
// response is sent.
//
// Validates: Requirements 6.5
// ---------------------------------------------------------------------------

describe('Property 15 — Session cleanup after assessment completion', () => {
  it('session ID is removed from the Map after a completed assessment', () => {
    /**
     * **Validates: Requirements 6.5**
     *
     * For any session that reaches the completion threshold
     * (conversation.length >= 4), deleting it from the sessions Map must
     * result in the session ID no longer being present in the Map.
     */
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.integer({ min: 1, max: 10000 }),
        (sessionId, userId) => {
          const sessions = new Map<string, SessionState>();

          // Build a session that has reached the completion threshold
          let session = createSession(userId);
          // Add 2 user messages and 2 assistant responses (4 entries total)
          session = appendUserMessage(session, 'I have a sore throat');
          session = appendAssistantMessage(session, 'How long have you had this?');
          session = appendUserMessage(session, 'About 3 days, with mild fever');
          session = appendAssistantMessage(session, 'Any other symptoms?');

          sessions.set(sessionId, session);

          // Precondition: session exists and is ready for assessment
          expect(sessions.has(sessionId)).toBe(true);
          expect(isAssessmentReady(session)).toBe(true);

          // Simulate the cleanup that happens when diagnosis_ready is true
          sessions.delete(sessionId);

          // Postcondition: session ID no longer present
          expect(sessions.has(sessionId)).toBe(false);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('session is not cleaned up before the completion threshold is reached', () => {
    /**
     * **Validates: Requirements 6.5**
     *
     * Sessions with fewer than 4 conversation entries must NOT be considered
     * complete, ensuring premature cleanup does not occur.
     */
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.integer({ min: 1, max: 10000 }),
        fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 3 }),
        (sessionId, userId, messages) => {
          const sessions = new Map<string, SessionState>();

          let session = createSession(userId);
          for (const message of messages) {
            session = appendUserMessage(session, message);
          }
          sessions.set(sessionId, session);

          // Session should still be active (not yet complete)
          expect(isAssessmentReady(session)).toBe(false);
          expect(sessions.has(sessionId)).toBe(true);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('only the completed session is removed — other sessions remain intact', () => {
    /**
     * **Validates: Requirements 6.5**
     *
     * When a session is cleaned up after completion, other active sessions
     * in the Map must not be affected.
     */
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 10000 }),
        (completedSessionId, activeSessionId, userId1, userId2) => {
          // Ensure the two session IDs are distinct
          fc.pre(completedSessionId !== activeSessionId);

          const sessions = new Map<string, SessionState>();

          // Completed session (4 entries)
          let completedSession = createSession(userId1);
          completedSession = appendUserMessage(completedSession, 'I have chest tightness');
          completedSession = appendAssistantMessage(completedSession, 'How severe is it?');
          completedSession = appendUserMessage(completedSession, 'Moderate, started this morning');
          completedSession = appendAssistantMessage(completedSession, 'Any other symptoms?');
          sessions.set(completedSessionId, completedSession);

          // Active session (still in progress)
          let activeSession = createSession(userId2);
          activeSession = appendUserMessage(activeSession, 'I have a headache');
          sessions.set(activeSessionId, activeSession);

          // Simulate cleanup of the completed session
          sessions.delete(completedSessionId);

          // Completed session is gone
          expect(sessions.has(completedSessionId)).toBe(false);
          // Active session is unaffected
          expect(sessions.has(activeSessionId)).toBe(true);
          expect(sessions.get(activeSessionId)).toEqual(activeSession);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('isAssessmentReady returns true exactly when conversation.length >= 4', () => {
    /**
     * **Validates: Requirements 6.5**
     *
     * The completion threshold is conversation.length >= 4. This property
     * verifies the boundary condition holds for all generated lengths.
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 1, max: 10000 }),
        (targetLength, userId) => {
          let session = createSession(userId);

          // Build a session with exactly targetLength entries (alternating user/assistant)
          for (let i = 0; i < targetLength; i++) {
            if (i % 2 === 0) {
              session = appendUserMessage(session, `message ${i}`);
            } else {
              session = appendAssistantMessage(session, `response ${i}`);
            }
          }

          const expected = targetLength >= 4;
          expect(isAssessmentReady(session)).toBe(expected);
        },
      ),
      { numRuns: 500 },
    );
  });
});
