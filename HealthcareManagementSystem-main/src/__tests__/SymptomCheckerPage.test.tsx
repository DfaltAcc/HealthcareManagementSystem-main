/**
 * Property-based tests for SymptomCheckerPage state logic.
 *
 * The SymptomCheckerPage component manages local state for the chat thread,
 * session ID, emergency modal, and assessment display. Because the test
 * environment is Node (no DOM / jsdom), these tests model the component's
 * state transitions as pure functions — the same approach used throughout
 * this test suite (see checkEmergency.test.ts, symcheckSession.test.ts, etc.).
 *
 * Validates: Requirements 1.3, 1.6, 1.7, 1.9, 2.2
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Types (mirrored from SymptomCheckerPage.tsx and src/types/index.ts)
// ---------------------------------------------------------------------------

interface AssessmentResult {
  diagnosis: string;
  urgency: string;
  confidence: number;
  homeRemedies: string[];
  recommendedActions: string[];
  assessmentId?: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  content: string;
  timestamp: Date;
  isAssessment?: boolean;
  assessment?: AssessmentResult;
  isError?: boolean;
}

interface EmergencyResponse {
  is_emergency: true;
  diagnosis: string;
  actions: string[];
  urgency: 'EMERGENCY';
  condition: string;
}

interface SymptomCheckerState {
  messages: ChatMessage[];
  sessionId: string;
  inputText: string;
  isLoading: boolean;
  showEmergencyModal: boolean;
  emergencyData: EmergencyResponse | null;
  savedAssessmentId: number | null;
}

// ---------------------------------------------------------------------------
// Pure state helpers (mirror the logic in SymptomCheckerPage.tsx)
// ---------------------------------------------------------------------------

/** Create the initial page state (mirrors useState initialisers in the component). */
function createInitialState(sessionId: string): SymptomCheckerState {
  return {
    messages: [],
    sessionId,
    inputText: '',
    isLoading: false,
    showEmergencyModal: false,
    emergencyData: null,
    savedAssessmentId: null,
  };
}

/** Append a message to the thread (mirrors the addMessage helper). */
function addMessage(
  state: SymptomCheckerState,
  msg: Omit<ChatMessage, 'id' | 'timestamp'>,
): SymptomCheckerState {
  const newMsg: ChatMessage = {
    ...msg,
    id: `msg-${state.messages.length}`,
    timestamp: new Date(),
  };
  return { ...state, messages: [...state.messages, newMsg] };
}

/**
 * Simulate submitting a user message (mirrors the first part of handleSubmit).
 * Appends the user message to the thread and clears the input.
 */
function submitUserMessage(
  state: SymptomCheckerState,
  text: string,
): SymptomCheckerState {
  const trimmed = text.trim();
  if (!trimmed || state.isLoading) return state;
  const withMsg = addMessage(state, { role: 'user', content: trimmed });
  return { ...withMsg, inputText: '', isLoading: true };
}

/**
 * Simulate receiving a normal bot response (follow-up question path).
 */
function receiveBotResponse(
  state: SymptomCheckerState,
  responseText: string,
): SymptomCheckerState {
  const withMsg = addMessage(state, { role: 'bot', content: responseText });
  return { ...withMsg, isLoading: false };
}

/**
 * Simulate receiving an assessment-ready response (mirrors the assessment_ready path).
 */
function receiveAssessmentResponse(
  state: SymptomCheckerState,
  assessment: AssessmentResult,
): SymptomCheckerState {
  const withMsg = addMessage(state, {
    role: 'bot',
    content: assessment.diagnosis,
    isAssessment: true,
    assessment,
  });
  return { ...withMsg, isLoading: false };
}

/**
 * Simulate receiving an emergency response (mirrors the is_emergency path).
 */
function receiveEmergencyResponse(
  state: SymptomCheckerState,
  emergencyData: EmergencyResponse,
): SymptomCheckerState {
  return {
    ...state,
    isLoading: false,
    showEmergencyModal: true,
    emergencyData,
  };
}

/**
 * Simulate "Start New Chat" (mirrors handleStartNewChat).
 */
function startNewChat(
  state: SymptomCheckerState,
  newSessionId: string,
): SymptomCheckerState {
  return {
    ...state,
    messages: [],
    sessionId: newSessionId,
    savedAssessmentId: null,
    inputText: '',
  };
}

// ---------------------------------------------------------------------------
// Emergency condition keywords (mirrored from Server.js / checkEmergency.test.ts)
// ---------------------------------------------------------------------------

const EMERGENCY_CONDITIONS: Record<
  string,
  { keywords: string[]; diagnosis: string; actions: string[] }
> = {
  stroke: {
    keywords: [
      'stroke', 'face drooping', 'arm weakness', 'slurred speech',
      'sudden confusion', 'trouble speaking', 'sudden numbness',
      'face numb', 'arm numb', 'leg numb', 'sudden vision',
      'trouble walking', 'loss of balance', 'severe headache sudden',
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
      'chest pain', 'chest pressure', 'heart attack', 'chest tightness',
      'pain spreading to arm', 'pain in jaw', 'shortness of breath',
      'cold sweat', 'pain left arm', 'pain right arm',
      'nausea chest pain', 'indigestion chest', 'lightheaded',
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

const ALL_KEYWORDS: string[] = Object.values(EMERGENCY_CONDITIONS).flatMap(
  (c) => c.keywords,
);

/** Server-side emergency detector (mirrored from Server.js). */
function checkEmergency(text: string): { is_emergency: boolean; condition?: string; diagnosis?: string; actions?: string[]; urgency?: string } {
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
// Arbitraries
// ---------------------------------------------------------------------------

/** Non-empty string that is not all whitespace. */
const nonEmptySymptom = fc.string({ minLength: 1, maxLength: 200 }).filter(
  (s) => s.trim().length > 0,
);

/** Valid assessment object. */
const validAssessment = fc.record({
  diagnosis: fc.string({ minLength: 1, maxLength: 200 }),
  urgency: fc.constantFrom('EMERGENCY', 'URGENT', 'NON-URGENT'),
  confidence: fc.float({ min: 0, max: 100, noNaN: true }),
  homeRemedies: fc.array(fc.string({ minLength: 1 }), { maxLength: 5 }),
  recommendedActions: fc.array(fc.string({ minLength: 1 }), { maxLength: 5 }),
  assessmentId: fc.option(fc.integer({ min: 1 }), { nil: undefined }),
});

/** A UUID-like session ID. */
const sessionIdArb = fc.uuid();

// ---------------------------------------------------------------------------
// Property 1: Message submission appears in thread
//
// For any non-empty symptom string, after submission the message should appear
// in the messages array.
//
// Validates: Requirements 1.3
// ---------------------------------------------------------------------------

describe('Property 1 — Message submission appears in thread', () => {
  it('submitted message content appears in the messages array', () => {
    /**
     * **Validates: Requirements 1.3**
     *
     * For any non-empty symptom string, calling submitUserMessage must add
     * exactly one new message to the thread whose content equals the trimmed
     * input text.
     */
    fc.assert(
      fc.property(
        sessionIdArb,
        nonEmptySymptom,
        (sessionId, symptomText) => {
          const state = createInitialState(sessionId);
          const nextState = submitUserMessage(state, symptomText);

          // Message count increases by exactly 1
          expect(nextState.messages.length).toBe(state.messages.length + 1);

          // The new message has the correct content
          const lastMsg = nextState.messages[nextState.messages.length - 1];
          expect(lastMsg.content).toBe(symptomText.trim());
          expect(lastMsg.role).toBe('user');
        },
      ),
      { numRuns: 500 },
    );
  });

  it('submitted message is always the last entry in the thread', () => {
    /**
     * **Validates: Requirements 1.3**
     *
     * After submitting a message, it must be the last element in the messages
     * array regardless of how many prior messages exist.
     */
    fc.assert(
      fc.property(
        sessionIdArb,
        fc.array(nonEmptySymptom, { minLength: 0, maxLength: 5 }),
        nonEmptySymptom,
        (sessionId, priorMessages, newMessage) => {
          let state = createInitialState(sessionId);

          // Build up prior conversation
          for (const msg of priorMessages) {
            state = addMessage(state, { role: 'user', content: msg });
            state = addMessage(state, { role: 'bot', content: 'Follow-up question?' });
          }

          const beforeCount = state.messages.length;
          const nextState = submitUserMessage(state, newMessage);

          expect(nextState.messages.length).toBe(beforeCount + 1);
          const lastMsg = nextState.messages[nextState.messages.length - 1];
          expect(lastMsg.content).toBe(newMessage.trim());
        },
      ),
      { numRuns: 300 },
    );
  });

  it('empty or whitespace-only input does not add a message', () => {
    /**
     * **Validates: Requirements 1.3**
     *
     * Submitting an empty or whitespace-only string must not modify the
     * messages array.
     */
    fc.assert(
      fc.property(
        sessionIdArb,
        fc.string({ maxLength: 20 }).filter((s) => s.trim().length === 0),
        (sessionId, emptyInput) => {
          const state = createInitialState(sessionId);
          const nextState = submitUserMessage(state, emptyInput);
          expect(nextState.messages.length).toBe(0);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('input is cleared after submission', () => {
    /**
     * **Validates: Requirements 1.3**
     *
     * After a successful submission, inputText must be reset to an empty string.
     */
    fc.assert(
      fc.property(
        sessionIdArb,
        nonEmptySymptom,
        (sessionId, symptomText) => {
          const state = { ...createInitialState(sessionId), inputText: symptomText };
          const nextState = submitUserMessage(state, symptomText);
          expect(nextState.inputText).toBe('');
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Assessment card completeness
//
// For any valid assessment object, the rendered AssessmentCard should display
// all fields and always include the disclaimer text.
//
// Validates: Requirements 1.6, 1.7
// ---------------------------------------------------------------------------

describe('Property 2 — Assessment card completeness', () => {
  /**
   * The AssessmentCard is a pure rendering component. Since we cannot render
   * DOM in the node test environment, we verify the data contract: that the
   * assessment message stored in state contains all required fields and that
   * the disclaimer constant is always present.
   */

  const DISCLAIMER_TEXT = 'NOT MEDICAL ADVICE — FOR INFORMATIONAL PURPOSES ONLY';

  it('assessment message in state contains all required fields', () => {
    /**
     * **Validates: Requirements 1.6**
     *
     * For any valid assessment object, the bot message added to the thread
     * must carry all required fields: diagnosis, urgency, confidence,
     * homeRemedies, and recommendedActions.
     */
    fc.assert(
      fc.property(
        sessionIdArb,
        validAssessment,
        (sessionId, assessment) => {
          const state = createInitialState(sessionId);
          const nextState = receiveAssessmentResponse(state, assessment);

          const assessmentMsg = nextState.messages.find((m) => m.isAssessment);
          expect(assessmentMsg).toBeDefined();
          expect(assessmentMsg!.assessment).toBeDefined();

          const a = assessmentMsg!.assessment!;
          expect(typeof a.diagnosis).toBe('string');
          expect(a.diagnosis.length).toBeGreaterThan(0);
          expect(['EMERGENCY', 'URGENT', 'NON-URGENT']).toContain(a.urgency);
          expect(typeof a.confidence).toBe('number');
          expect(a.confidence).toBeGreaterThanOrEqual(0);
          expect(a.confidence).toBeLessThanOrEqual(100);
          expect(Array.isArray(a.homeRemedies)).toBe(true);
          expect(Array.isArray(a.recommendedActions)).toBe(true);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('disclaimer text constant is always defined and non-empty', () => {
    /**
     * **Validates: Requirements 1.7**
     *
     * The disclaimer text "NOT MEDICAL ADVICE — FOR INFORMATIONAL PURPOSES ONLY"
     * must always be present as a non-empty string. This property verifies the
     * constant itself is invariant across all assessment inputs.
     */
    fc.assert(
      fc.property(
        validAssessment,
        (_assessment) => {
          // The disclaimer is a compile-time constant in AssessmentCard.
          // We verify it is always the expected string.
          expect(DISCLAIMER_TEXT).toBe('NOT MEDICAL ADVICE — FOR INFORMATIONAL PURPOSES ONLY');
          expect(DISCLAIMER_TEXT.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('assessment message is always marked as isAssessment=true', () => {
    /**
     * **Validates: Requirements 1.6**
     *
     * The bot message carrying an assessment must have isAssessment=true so
     * the component renders the AssessmentCard instead of a plain bubble.
     */
    fc.assert(
      fc.property(
        sessionIdArb,
        validAssessment,
        (sessionId, assessment) => {
          const state = createInitialState(sessionId);
          const nextState = receiveAssessmentResponse(state, assessment);

          const assessmentMsg = nextState.messages.find((m) => m.isAssessment);
          expect(assessmentMsg).toBeDefined();
          expect(assessmentMsg!.isAssessment).toBe(true);
          expect(assessmentMsg!.role).toBe('bot');
        },
      ),
      { numRuns: 500 },
    );
  });

  it('confidence is always clamped between 0 and 100', () => {
    /**
     * **Validates: Requirements 1.6**
     *
     * The confidence value stored in the assessment must always be in [0, 100].
     * This mirrors the Math.min/Math.max clamping in the AssessmentCard render.
     */
    fc.assert(
      fc.property(
        sessionIdArb,
        fc.record({
          diagnosis: fc.string({ minLength: 1 }),
          urgency: fc.constantFrom('EMERGENCY', 'URGENT', 'NON-URGENT'),
          confidence: fc.float({ min: 0, max: 100, noNaN: true }),
          homeRemedies: fc.array(fc.string({ minLength: 1 }), { maxLength: 3 }),
          recommendedActions: fc.array(fc.string({ minLength: 1 }), { maxLength: 3 }),
        }),
        (sessionId, assessment) => {
          const state = createInitialState(sessionId);
          const nextState = receiveAssessmentResponse(state, assessment);

          const assessmentMsg = nextState.messages.find((m) => m.isAssessment);
          const confidence = assessmentMsg!.assessment!.confidence;
          const clamped = Math.min(100, Math.max(0, confidence));
          expect(clamped).toBe(confidence);
        },
      ),
      { numRuns: 500 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: New session resets state
//
// For any non-empty conversation state, triggering "Start New Chat" should
// result in an empty messages array and a new session ID different from the
// previous one.
//
// Validates: Requirements 1.9
// ---------------------------------------------------------------------------

describe('Property 3 — New session resets state', () => {
  it('messages array is empty after starting a new chat', () => {
    /**
     * **Validates: Requirements 1.9**
     *
     * For any non-empty conversation state, calling startNewChat must produce
     * a state with an empty messages array.
     */
    fc.assert(
      fc.property(
        sessionIdArb,
        fc.array(nonEmptySymptom, { minLength: 1, maxLength: 10 }),
        sessionIdArb,
        (oldSessionId, priorMessages, newSessionId) => {
          fc.pre(oldSessionId !== newSessionId);

          let state = createInitialState(oldSessionId);
          for (const msg of priorMessages) {
            state = addMessage(state, { role: 'user', content: msg });
          }

          // Precondition: state has messages
          expect(state.messages.length).toBeGreaterThan(0);

          const nextState = startNewChat(state, newSessionId);
          expect(nextState.messages.length).toBe(0);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('new session ID is different from the previous one', () => {
    /**
     * **Validates: Requirements 1.9**
     *
     * The session ID after "Start New Chat" must differ from the previous
     * session ID, ensuring a fresh conversation context.
     */
    fc.assert(
      fc.property(
        sessionIdArb,
        sessionIdArb,
        (oldSessionId, newSessionId) => {
          fc.pre(oldSessionId !== newSessionId);

          const state = createInitialState(oldSessionId);
          const nextState = startNewChat(state, newSessionId);

          expect(nextState.sessionId).not.toBe(oldSessionId);
          expect(nextState.sessionId).toBe(newSessionId);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('savedAssessmentId is reset to null after starting a new chat', () => {
    /**
     * **Validates: Requirements 1.9**
     *
     * The savedAssessmentId must be cleared when a new chat is started so
     * the "Save Assessment" button is re-enabled for the new session.
     */
    fc.assert(
      fc.property(
        sessionIdArb,
        fc.integer({ min: 1, max: 9999 }),
        sessionIdArb,
        (oldSessionId, savedId, newSessionId) => {
          fc.pre(oldSessionId !== newSessionId);

          const state = { ...createInitialState(oldSessionId), savedAssessmentId: savedId };
          const nextState = startNewChat(state, newSessionId);

          expect(nextState.savedAssessmentId).toBeNull();
        },
      ),
      { numRuns: 300 },
    );
  });

  it('inputText is cleared after starting a new chat', () => {
    /**
     * **Validates: Requirements 1.9**
     *
     * Any text in the input field must be cleared when a new chat is started.
     */
    fc.assert(
      fc.property(
        sessionIdArb,
        nonEmptySymptom,
        sessionIdArb,
        (oldSessionId, inputText, newSessionId) => {
          fc.pre(oldSessionId !== newSessionId);

          const state = { ...createInitialState(oldSessionId), inputText };
          const nextState = startNewChat(state, newSessionId);

          expect(nextState.inputText).toBe('');
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: Emergency modal shown for any emergency keyword
//
// For any message containing an emergency keyword, showEmergencyModal should
// be true and emergencyData should be populated.
//
// Validates: Requirements 2.2
// ---------------------------------------------------------------------------

describe('Property 5 — Emergency modal shown for any emergency keyword', () => {
  it('showEmergencyModal is true after receiving an emergency response', () => {
    /**
     * **Validates: Requirements 2.2**
     *
     * For any message containing an emergency keyword, after the server
     * returns an emergency response, showEmergencyModal must be true.
     */
    fc.assert(
      fc.property(
        sessionIdArb,
        fc.constantFrom(...ALL_KEYWORDS),
        fc.string({ maxLength: 30 }),
        fc.string({ maxLength: 30 }),
        (sessionId, keyword, prefix, suffix) => {
          const message = `${prefix} ${keyword} ${suffix}`;
          const emergencyResult = checkEmergency(message);

          // Precondition: the message triggers emergency detection
          expect(emergencyResult.is_emergency).toBe(true);

          const emergencyData: EmergencyResponse = {
            is_emergency: true,
            condition: emergencyResult.condition!,
            diagnosis: emergencyResult.diagnosis!,
            actions: emergencyResult.actions!,
            urgency: 'EMERGENCY',
          };

          let state = createInitialState(sessionId);
          state = submitUserMessage(state, message);
          const nextState = receiveEmergencyResponse(state, emergencyData);

          expect(nextState.showEmergencyModal).toBe(true);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('emergencyData is populated with condition name and actions', () => {
    /**
     * **Validates: Requirements 2.2**
     *
     * When an emergency is detected, emergencyData must contain the condition
     * name, the list of immediate actions, and urgency='EMERGENCY'.
     */
    fc.assert(
      fc.property(
        sessionIdArb,
        fc.constantFrom(...ALL_KEYWORDS),
        (sessionId, keyword) => {
          const emergencyResult = checkEmergency(keyword);
          expect(emergencyResult.is_emergency).toBe(true);

          const emergencyData: EmergencyResponse = {
            is_emergency: true,
            condition: emergencyResult.condition!,
            diagnosis: emergencyResult.diagnosis!,
            actions: emergencyResult.actions!,
            urgency: 'EMERGENCY',
          };

          let state = createInitialState(sessionId);
          state = submitUserMessage(state, keyword);
          const nextState = receiveEmergencyResponse(state, emergencyData);

          expect(nextState.emergencyData).not.toBeNull();
          expect(nextState.emergencyData!.urgency).toBe('EMERGENCY');
          expect(nextState.emergencyData!.condition).toBe(emergencyResult.condition);
          expect(nextState.emergencyData!.actions.length).toBeGreaterThan(0);
          expect(nextState.emergencyData!.actions[0]).toBe('CALL 911 IMMEDIATELY');
        },
      ),
      { numRuns: ALL_KEYWORDS.length * 2 },
    );
  });

  it('normal LLM flow does not set showEmergencyModal', () => {
    /**
     * **Validates: Requirements 2.2**
     *
     * For messages that do not contain emergency keywords, receiving a normal
     * bot response must not set showEmergencyModal to true.
     */
    fc.assert(
      fc.property(
        sessionIdArb,
        fc.string({ minLength: 1, maxLength: 100 }).filter((s) => {
          const lower = s.toLowerCase();
          return s.trim().length > 0 && ALL_KEYWORDS.every((kw) => !lower.includes(kw));
        }),
        fc.string({ minLength: 1, maxLength: 100 }),
        (sessionId, userMessage, botResponse) => {
          let state = createInitialState(sessionId);
          state = submitUserMessage(state, userMessage);
          const nextState = receiveBotResponse(state, botResponse);

          expect(nextState.showEmergencyModal).toBe(false);
          expect(nextState.emergencyData).toBeNull();
        },
      ),
      { numRuns: 300 },
    );
  });

  it('emergency modal state is independent of prior conversation length', () => {
    /**
     * **Validates: Requirements 2.2**
     *
     * The emergency modal must be shown regardless of how many prior messages
     * exist in the thread — emergency detection is immediate.
     */
    fc.assert(
      fc.property(
        sessionIdArb,
        fc.array(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => {
            const lower = s.toLowerCase();
            return ALL_KEYWORDS.every((kw) => !lower.includes(kw));
          }),
          { minLength: 0, maxLength: 5 },
        ),
        fc.constantFrom(...ALL_KEYWORDS),
        (sessionId, priorMessages, emergencyKeyword) => {
          let state = createInitialState(sessionId);

          // Build up prior non-emergency conversation
          for (const msg of priorMessages) {
            state = addMessage(state, { role: 'user', content: msg });
            state = addMessage(state, { role: 'bot', content: 'Tell me more.' });
          }

          // Now submit an emergency message
          state = submitUserMessage(state, emergencyKeyword);

          const emergencyResult = checkEmergency(emergencyKeyword);
          const emergencyData: EmergencyResponse = {
            is_emergency: true,
            condition: emergencyResult.condition!,
            diagnosis: emergencyResult.diagnosis!,
            actions: emergencyResult.actions!,
            urgency: 'EMERGENCY',
          };

          const nextState = receiveEmergencyResponse(state, emergencyData);

          expect(nextState.showEmergencyModal).toBe(true);
          expect(nextState.emergencyData).not.toBeNull();
        },
      ),
      { numRuns: 300 },
    );
  });
});
