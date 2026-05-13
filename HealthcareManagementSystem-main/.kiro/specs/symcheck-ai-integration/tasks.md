# Implementation Plan: SymCheck AI Integration

## Overview

Integrate AI-powered symptom checking into the HMS by adding backend endpoints to `Server.js`, a new API module, three new pages, and navigation wiring. Implementation follows a dependency-first order: packages and DB schema → types → backend endpoints → frontend pages → navigation.

## Tasks

- [x] 1. Install dependencies and create the database table
  - Run `npm install pdfkit recharts` in the project root to add PDF generation and charting libraries
  - Run `npm install --save-dev fast-check @types/pdfkit` to add property-based testing support and pdfkit types
  - Add the `ai_assessments` table creation block inside `ensureDatabaseAndTables()` in `Server.js`, after the existing `medicines` table block:
    ```sql
    CREATE TABLE IF NOT EXISTS ai_assessments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      sessionId VARCHAR(100) NOT NULL,
      symptoms TEXT NOT NULL,
      conversation TEXT,
      diagnosis TEXT,
      urgency VARCHAR(50) NOT NULL DEFAULT 'NON-URGENT',
      confidence FLOAT,
      homeRemedies TEXT,
      recommendedActions TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user (userId),
      INDEX idx_session (sessionId),
      INDEX idx_urgency (urgency),
      INDEX idx_created (createdAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ```
  - _Requirements: 6.8_

- [x] 2. Add TypeScript interfaces to `src/types/index.ts`
  - Append the four new interfaces to the end of `src/types/index.ts`:
    - `AIAssessment` (id, userId, sessionId, symptoms, conversation, diagnosis, urgency, confidence, homeRemedies, recommendedActions, createdAt)
    - `AnalyzeResponse` (response, confidence, urgency, assessment_ready, session_id, is_emergency, emergency_data)
    - `EmergencyResponse` (is_emergency, diagnosis, actions, urgency, condition)
    - `AIStats` (totalAssessments, urgencyCounts, confidenceTrend)
  - Use exact field names and types from the design document's TypeScript Interface section
  - _Requirements: 1.6, 2.2, 5.2_

- [x] 3. Implement backend emergency detection and session infrastructure in `Server.js`
  - Add the `activeSymcheckSessions` Map declaration at module level (after the existing `broadcastWardUpdate` function):
    ```javascript
    const activeSymcheckSessions = new Map();
    ```
  - Add the `EMERGENCY_CONDITIONS` keyword dictionary constant (stroke and heart_attack entries with all keywords, diagnosis, and actions as specified in the design)
  - Add the pure `checkEmergency(text)` function that lowercases the input, iterates `EMERGENCY_CONDITIONS`, and returns `{ is_emergency: true, condition, diagnosis, actions, urgency: 'EMERGENCY' }` on a match or `{ is_emergency: false }` otherwise
  - _Requirements: 2.1, 2.5, 2.6, 6.2, 6.3_

  - [x] 3.1 Write property tests for `checkEmergency`
    - Create `src/__tests__/checkEmergency.test.ts` using fast-check
    - **Property 4: Emergency detection precedes Ollama** — for any message containing at least one keyword from `EMERGENCY_CONDITIONS`, `checkEmergency` returns `is_emergency: true`
    - **Property 6: Case-insensitive emergency detection** — for any emergency keyword and any casing transformation (uppercase, lowercase, mixed), `checkEmergency` returns `is_emergency: true`
    - **Validates: Requirements 2.1, 2.5, 2.6, 6.2, 6.3**

- [x] 4. Implement `POST /api/symcheck/analyze` endpoint in `Server.js`
  - Add a clearly marked `// ==================== SYMCHECK AI ROUTES ====================` section after the existing routes
  - Implement the handler following the design's server logic:
    1. Read `message`, `sessionId`, `userId` from `req.body`
    2. Call `checkEmergency(message)` — if emergency, insert into `ai_assessments` with `urgency='EMERGENCY'` and return the emergency response JSON immediately
    3. Look up or create session in `activeSymcheckSessions` (store `{ conversation: [], symptoms: '', questionsAsked: [], userId }`)
    4. Append user message to `session.conversation`; store first message as `session.symptoms`
    5. If `session.conversation` has fewer than 4 entries (< 2 patient exchanges), call Ollama with a follow-up question prompt; otherwise call with a diagnosis prompt
    6. Set a 60-second timeout on the Ollama `fetch` call; return HTTP 504 on timeout
    7. Return HTTP 503 if Ollama is unreachable or returns non-200
    8. Parse Ollama response JSON; if `diagnosis_ready`, insert into `ai_assessments`, delete session from map, return full assessment response
    9. Otherwise return follow-up response with `assessment_ready: false`
  - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.8, 2.1, 2.2, 2.3, 2.4, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 4.1 Write property tests for session state accumulation
    - Add tests to `src/__tests__/symcheckSession.test.ts` using fast-check
    - **Property 14: Session state accumulates correctly** — for any sequence of messages with the same session ID, each call should have access to the full prior conversation history
    - **Property 15: Session cleanup after assessment completion** — for any session that produces a completed assessment, the session ID should no longer exist in `activeSymcheckSessions` after the response
    - **Validates: Requirements 6.4, 6.5**

- [x] 5. Implement `GET /api/symcheck/history` and `GET /api/symcheck/history/:id` endpoints in `Server.js`
  - `GET /api/symcheck/history`: read `userId` from `req.query`, query `ai_assessments WHERE userId = ? ORDER BY createdAt DESC`, JSON-parse `homeRemedies` and `recommendedActions` columns before returning
  - `GET /api/symcheck/history/:id`: read `userId` from `req.query`, query by `id`, return HTTP 404 if not found, HTTP 403 if `record.userId !== userId`, otherwise return full record with parsed JSON fields
  - _Requirements: 3.2, 3.3, 3.8, 3.9_

  - [x] 5.1 Write property test for ownership verification
    - Add tests to `src/__tests__/symcheckOwnership.test.ts` using fast-check
    - **Property 9: Ownership verification on assessment access** — for any assessment belonging to user A, a request with a different `userId` should receive HTTP 403
    - **Validates: Requirements 3.9, 4.3**

  - [x] 5.2 Write property test for history ordering
    - **Property 7: Assessment history ordered newest-first** — for any collection of assessments with varying `createdAt` timestamps, the API response should always be in descending chronological order
    - **Validates: Requirements 3.2, 3.8**

- [x] 6. Implement `GET /api/symcheck/report/:id` PDF endpoint in `Server.js`
  - Import `PDFDocument` from `pdfkit` at the top of `Server.js` (add alongside existing imports)
  - Implement the handler: read `userId` from `req.query`, fetch assessment, check ownership (HTTP 403/404 on failure), then:
    - Create a `new PDFDocument({ margin: 50 })`
    - Set `Content-Type: application/pdf` and `Content-Disposition: attachment; filename="symcheck_report_<id>.pdf"`
    - Pipe `doc` to `res`
    - Write all PDF sections in order: HMS branding header (blue `#2563eb`, 24pt bold), patient name + date, Symptoms, Diagnosis, Urgency (color-coded: `#dc2626` EMERGENCY / `#d97706` URGENT / `#16a34a` NON-URGENT), Confidence, Home Remedies list, Recommended Actions list, disclaimer footer (grey, italic, centered)
    - Call `doc.end()`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 6.1 Write property tests for PDF generation
    - Add tests to `src/__tests__/symcheckPdf.test.ts` using fast-check
    - **Property 11: PDF Content-Disposition header** — for any successful PDF generation, the response should include `Content-Disposition: attachment; filename="symcheck_report_<id>.pdf"`
    - **Property 12: PDF urgency color coding** — for any assessment with urgency `EMERGENCY`, `URGENT`, or `NON-URGENT`, the PDF generation function should apply the corresponding color (`#dc2626`, `#d97706`, `#16a34a`)
    - **Validates: Requirements 4.5, 4.6**

- [x] 7. Implement `GET /api/symcheck/stats` endpoint in `Server.js`
  - Read `userId` from `req.query`, verify the user's role is `admin` or `doctor` by querying `users` table; return HTTP 403 if not
  - Run three queries against `ai_assessments`:
    1. `SELECT COUNT(*) as total FROM ai_assessments`
    2. `SELECT urgency, COUNT(*) as count FROM ai_assessments GROUP BY urgency`
    3. `SELECT DATE(createdAt) as date, AVG(confidence) as confidence FROM ai_assessments GROUP BY DATE(createdAt) ORDER BY date ASC`
  - Build and return the `AIStats` JSON shape: `{ totalAssessments, urgencyCounts: { EMERGENCY, URGENT, NON_URGENT }, confidenceTrend: [{ date, confidence }] }`
  - _Requirements: 5.2, 5.6, 5.7_

  - [x] 7.1 Write property test for stats aggregation
    - Add tests to `src/__tests__/symcheckStats.test.ts` using fast-check
    - **Property 13: Stats API correct aggregation and ordering** — for any collection of assessments, `totalAssessments` equals total record count, each `urgencyCounts` entry equals the count of records with that urgency, and `confidenceTrend` is ordered by date ascending
    - **Validates: Requirements 5.6**

- [x] 8. Checkpoint — verify all backend endpoints
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Create `src/api/symcheckApi.ts`
  - Follow the same pattern as `src/api/appointmentsApi.ts` (plain `fetch` to `http://localhost:5000/api`)
  - Export five functions:
    - `analyzeSymptoms(message: string, sessionId: string, userId: number): Promise<AnalyzeResponse>` — POST `/api/symcheck/analyze`
    - `fetchAssessmentHistory(userId: number): Promise<AIAssessment[]>` — GET `/api/symcheck/history?userId=`
    - `fetchAssessment(id: number, userId: number): Promise<AIAssessment>` — GET `/api/symcheck/history/:id?userId=`
    - `downloadReport(id: number, userId: number): Promise<Blob>` — GET `/api/symcheck/report/:id?userId=`, return `response.blob()`
    - `fetchAIStats(userId: number): Promise<AIStats>` — GET `/api/symcheck/stats?userId=`
  - Import `AIAssessment`, `AnalyzeResponse`, `AIStats` from `../types`
  - _Requirements: 1.3, 3.8, 3.9, 4.2, 5.6_

- [x] 10. Create `src/pages/SymptomCheckerPage.tsx`
  - Use the standard HMS layout: `<div className="flex h-screen bg-gray-100">` wrapping `<Sidebar />`, then `<div className="flex flex-col flex-1 overflow-hidden">` with `<Navbar />` and `<main className="flex-1 overflow-y-auto">`
  - Inside main, use `<div className="py-6"><div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">`
  - Implement local state matching `SymptomCheckerState` from the design (messages, sessionId, inputText, isLoading, showEmergencyModal, emergencyData, savedAssessmentId)
  - Initialize `sessionId` with `crypto.randomUUID()` on mount
  - Implement sub-components inline: `UrgencyBadge`, `AssessmentCard` (with disclaimer), `TypingIndicator` (three `animate-bounce` dots with staggered delays), `EmergencyModal` (fixed inset-0 z-50 bg-red-50 overlay)
  - On message submit: append user message to thread, call `analyzeSymptoms`, show typing indicator while awaiting; if `is_emergency` show `EmergencyModal`; if `assessment_ready` show `AssessmentCard`; otherwise show bot follow-up message
  - "Save Assessment" button calls `POST /api/symcheck/analyze` result's `assessment_id` (already persisted server-side — button just records `savedAssessmentId` in state and shows confirmation)
  - "Start New Chat" button resets messages to `[]` and sets a new `crypto.randomUUID()` session ID
  - On 503 or 504 errors, display the appropriate error message in the chat thread with a Retry button
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 2.2, 2.3_

  - [x] 10.1 Write property tests for SymptomCheckerPage state
    - Add tests to `src/__tests__/SymptomCheckerPage.test.tsx` using fast-check
    - **Property 1: Message submission appears in thread** — for any non-empty symptom string, after submission the message should appear in the messages array
    - **Property 2: Assessment card completeness** — for any valid assessment object, the rendered AssessmentCard should display all fields and always include the disclaimer text
    - **Property 3: New session resets state** — for any non-empty conversation state, triggering "Start New Chat" should result in an empty messages array and a new session ID different from the previous one
    - **Property 5: Emergency modal shown for any emergency keyword** — for any message containing an emergency keyword, `showEmergencyModal` should be `true` and `emergencyData` should be populated
    - **Validates: Requirements 1.3, 1.6, 1.7, 1.9, 2.2**

- [x] 11. Create `src/pages/SymptomCheckerHistoryPage.tsx`
  - Use the standard HMS layout (same wrapper pattern as task 10)
  - Page header: `ClipboardList` icon (lucide-react) + "Assessment History" title
  - Local state: `assessments: AIAssessment[]`, `selectedAssessment: AIAssessment | null`, `isLoading: boolean`
  - On mount, call `fetchAssessmentHistory(user.id)` and populate `assessments`
  - List view (when `selectedAssessment` is null): `<div className="bg-white shadow overflow-hidden sm:rounded-md"><ul className="divide-y divide-gray-200">` — each row shows date/time, symptom snippet (truncated to 100 chars), diagnosis, `UrgencyBadge`, confidence; clicking a row sets `selectedAssessment`
  - Empty state: display a message "No assessments recorded yet" when list is empty
  - Detail view (when `selectedAssessment` is set): back button, full symptom description, diagnosis, `UrgencyBadge`, confidence, home remedies list, recommended actions list, "Download PDF" button
  - "Download PDF" calls `downloadReport(selectedAssessment.id, user.id)` and triggers browser download via a temporary `<a>` element with `URL.createObjectURL(blob)`
  - Define `UrgencyBadge` inline (same implementation as in SymptomCheckerPage)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 11.1 Write property tests for history list rendering
    - Add tests to `src/__tests__/SymptomCheckerHistoryPage.test.tsx` using fast-check
    - **Property 7: Assessment history ordered newest-first** — for any array of assessments with varying `createdAt` values, the rendered list should display them in descending chronological order
    - **Property 8: History row contains all required fields** — for any assessment object, the rendered row should contain the formatted date/time, symptom snippet ≤ 100 chars, diagnosis, UrgencyBadge, and confidence score
    - **Validates: Requirements 3.2, 3.3**

- [x] 12. Create `src/pages/AIAnalyticsDashboardPage.tsx`
  - Use the standard HMS layout (same wrapper pattern as task 10)
  - Page header: `BarChart2` icon (lucide-react) + "AI Analytics" title
  - Local state: `stats: AIStats | null`, `isLoading: boolean`
  - On mount, call `fetchAIStats(user.id)` and populate `stats`
  - Stats row: `<div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">` using the existing `<StatsCard>` component (import from `../components/dashboard/StatsCard`) for Total Assessments (blue), Emergency (red), Urgent (amber), Non-Urgent (green)
  - Charts row: `<div className="grid grid-cols-1 gap-5 lg:grid-cols-2 mt-8">` — each chart in a `bg-white rounded-xl shadow-md overflow-hidden p-6` card
  - Urgency Breakdown: `<PieChart>` with `<Pie innerRadius={60} outerRadius={100}>` and `<Cell>` colors `#dc2626` / `#d97706` / `#16a34a`; wrap in `<ResponsiveContainer width="100%" height={300}>`
  - Confidence Trend: `<LineChart>` with `<XAxis dataKey="date">`, `<YAxis domain={[0,100]} unit="%">`, `<Line dataKey="confidence" stroke="#2563eb" strokeWidth={2} dot={false}>`; wrap in `<ResponsiveContainer width="100%" height={300}>`
  - Empty state: when `stats.totalAssessments === 0`, show zero values in StatsCards and "No data available" messages in chart areas
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7_

- [x] 13. Add navigation items to `src/components/layout/Sidebar.tsx`
  - Import `Brain` and `BarChart2` from `lucide-react` (add to the existing import statement)
  - Add two new entries to the `sidebarItems` array, after the existing `Lab Results` item:
    ```typescript
    {
      title: 'Symptom Checker',
      icon: <Brain className="w-5 h-5" />,
      path: '/symcheck',
      roles: ['patient']
    },
    {
      title: 'AI Analytics',
      icon: <BarChart2 className="w-5 h-5" />,
      path: '/symcheck/dashboard',
      roles: ['admin', 'doctor']
    }
    ```
  - The existing `isActive` logic (`location.pathname === item.path`) already applies `bg-blue-50 text-blue-700` — verify it activates correctly for `/symcheck` and `/symcheck/dashboard`
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 13.1 Write property test for active sidebar item
    - Add tests to `src/__tests__/Sidebar.test.tsx` using fast-check
    - **Property 16: Active sidebar item for /symcheck routes** — for any `/symcheck` route path, the corresponding sidebar item should have `bg-blue-50 text-blue-700` applied
    - **Validates: Requirements 7.3**

- [x] 14. Add routes to `src/App.tsx`
  - Import the three new pages at the top of `App.tsx`:
    ```typescript
    import SymptomCheckerPage from './pages/SymptomCheckerPage';
    import SymptomCheckerHistoryPage from './pages/SymptomCheckerHistoryPage';
    import AIAnalyticsDashboardPage from './pages/AIAnalyticsDashboardPage';
    ```
  - Add three new `<Route>` entries inside the existing `<Routes>`, before the catch-all `*` route:
    ```tsx
    <Route path="/symcheck" element={
      <ProtectedRoute allowedRoles={['patient']}>
        <SymptomCheckerPage />
      </ProtectedRoute>
    } />
    <Route path="/symcheck/history" element={
      <ProtectedRoute allowedRoles={['patient']}>
        <SymptomCheckerHistoryPage />
      </ProtectedRoute>
    } />
    <Route path="/symcheck/dashboard" element={
      <ProtectedRoute allowedRoles={['admin', 'doctor']}>
        <AIAnalyticsDashboardPage />
      </ProtectedRoute>
    } />
    ```
  - _Requirements: 7.5, 7.6_

- [ ] 15. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Backend tasks (3–7) must be completed before their corresponding frontend pages (10–12)
- Property tests use `fast-check` and should be run with `vitest --run`
- The `checkEmergency` function (task 3) is a pure function and can be extracted to a separate module for easier unit testing if desired
- `pdfkit` types are provided by `@types/pdfkit` (installed in task 1)
- Session IDs are generated client-side using `crypto.randomUUID()` — no server-side UUID library needed
