# Requirements Document

## Introduction

This feature integrates SymCheckAI capabilities into the existing Healthcare Management System (HMS). The integration adds an AI-powered symptom checker, emergency detection, AI assessment history, PDF report downloads, and an AI analytics dashboard — all presented within the existing HMS design system (React + TypeScript, Tailwind CSS, same sidebar navigation, card/table styles, and blue color scheme).

The AI backend uses Ollama running locally (`http://localhost:11434`) with the `gemma2:2b` model. The Node.js/Express server proxies all Ollama requests so the React frontend never communicates with Ollama directly. AI assessment records are persisted in the existing MySQL database.

---

## Glossary

- **SymCheck_Module**: The integrated AI symptom-checking feature set within the HMS.
- **AI_Chat**: The conversational symptom checker interface where a patient describes symptoms and receives a structured AI assessment.
- **Assessment**: A completed AI evaluation of a patient's symptoms, including a diagnosis, urgency level, confidence score, home remedies, and recommended actions.
- **Urgency_Level**: A classification of assessment severity — one of `EMERGENCY`, `URGENT`, or `NON-URGENT`.
- **Emergency_Detector**: The keyword-based subsystem that scans symptom input for stroke and heart attack indicators before any LLM call is made.
- **Ollama_Proxy**: The Node.js/Express endpoint that forwards LLM requests to the locally running Ollama service and returns responses to the frontend.
- **Assessment_History**: The per-patient list of all past AI assessments stored in the MySQL database.
- **PDF_Report**: A downloadable PDF document summarising a single AI assessment.
- **AI_Dashboard**: The analytics page showing urgency breakdown and confidence trend charts for AI assessments.
- **HMS**: The existing Healthcare Management System (React + TypeScript frontend, Node.js/Express + MySQL backend).
- **Patient**: A user with the `patient` role in the HMS.
- **Admin**: A user with the `admin` role in the HMS.
- **Doctor**: A user with the `doctor` role in the HMS.

---

## Requirements

### Requirement 1: AI Symptom Checker Chat Interface

**User Story:** As a patient, I want to describe my symptoms in a conversational chat interface, so that I can receive an AI-generated assessment with a diagnosis, urgency level, and care recommendations without leaving the HMS.

#### Acceptance Criteria

1. THE SymCheck_Module SHALL provide a dedicated `/symcheck` route accessible to users with the `patient` role.
2. WHEN a patient navigates to `/symcheck`, THE AI_Chat SHALL render within the standard HMS layout (Navbar + Sidebar) using the existing card and color styles.
3. WHEN a patient submits a symptom message, THE AI_Chat SHALL display the message in the conversation thread and send it to the Ollama_Proxy.
4. WHILE an AI response is being generated, THE AI_Chat SHALL display a typing indicator to the patient.
5. WHEN the Ollama_Proxy returns a follow-up question (before the assessment is ready), THE AI_Chat SHALL display the question and allow the patient to continue the conversation.
6. WHEN the AI has gathered sufficient information (after at least two patient exchanges), THE AI_Chat SHALL display a structured Assessment card containing: diagnosis, Urgency_Level badge, confidence percentage, home remedies list, and recommended actions list.
7. THE AI_Chat SHALL include a disclaimer stating "NOT MEDICAL ADVICE — FOR INFORMATIONAL PURPOSES ONLY" on every Assessment card.
8. WHEN an Assessment is displayed, THE AI_Chat SHALL offer a "Save Assessment" action that persists the Assessment to the MySQL database linked to the authenticated patient's user ID.
9. WHEN a patient starts a new chat session, THE AI_Chat SHALL clear the previous conversation thread and generate a new session identifier.
10. IF the Ollama_Proxy returns an error or times out, THEN THE AI_Chat SHALL display an error message and allow the patient to retry.

---

### Requirement 2: Emergency Detection

**User Story:** As a patient, I want the system to immediately alert me if my symptoms suggest a life-threatening emergency, so that I can seek help before waiting for a full AI assessment.

#### Acceptance Criteria

1. WHEN a patient submits a symptom message, THE Emergency_Detector SHALL scan the message text for stroke and heart attack keywords before forwarding the message to the Ollama_Proxy.
2. WHEN the Emergency_Detector identifies a stroke or heart attack keyword match, THE AI_Chat SHALL immediately display a full-screen emergency alert modal with: the condition name, a list of immediate actions (e.g., "CALL 911 IMMEDIATELY"), and an `EMERGENCY` Urgency_Level badge styled in red.
3. WHEN an emergency alert modal is displayed, THE AI_Chat SHALL not proceed with the normal LLM conversation flow until the patient acknowledges the alert.
4. WHEN the patient acknowledges the emergency alert, THE AI_Chat SHALL persist an Assessment record with `urgency = EMERGENCY` to the MySQL database.
5. THE Emergency_Detector SHALL detect at minimum the following conditions: stroke (keywords: "stroke", "face drooping", "arm weakness", "slurred speech", "sudden confusion", "sudden numbness", "sudden vision", "trouble walking", "loss of balance", "severe headache sudden") and heart attack (keywords: "chest pain", "chest pressure", "heart attack", "chest tightness", "pain spreading to arm", "pain in jaw", "shortness of breath", "cold sweat", "pain left arm").
6. IF the Emergency_Detector keyword scan is case-insensitive, THEN THE Emergency_Detector SHALL match keywords regardless of the capitalisation used by the patient.

---

### Requirement 3: AI Assessment History

**User Story:** As a patient, I want to view a list of all my past AI assessments, so that I can track my symptom history and share it with my doctor.

#### Acceptance Criteria

1. THE SymCheck_Module SHALL provide an Assessment_History view accessible at `/symcheck/history` for users with the `patient` role.
2. WHEN a patient navigates to `/symcheck/history`, THE Assessment_History SHALL display a list of all past Assessments for the authenticated patient, ordered by date descending.
3. THE Assessment_History list SHALL display for each Assessment: the date and time, the initial symptom description (truncated to 100 characters), the diagnosis name, the Urgency_Level badge, and the confidence score.
4. WHEN the Assessment_History list is empty, THE Assessment_History SHALL display an empty-state message indicating no assessments have been recorded.
5. WHEN a patient selects an Assessment from the list, THE Assessment_History SHALL display the full Assessment detail including: full symptom description, complete diagnosis, Urgency_Level, confidence score, home remedies, and recommended actions.
6. THE Assessment_History SHALL use the same table and card styles as existing HMS pages (white card, shadow, divide-y rows, blue accent text).
7. WHEN a patient views an Assessment detail, THE Assessment_History SHALL provide a "Download PDF" action for that Assessment.
8. THE SymCheck_Module SHALL expose a backend API endpoint `GET /api/symcheck/history` that returns all Assessment records for the authenticated patient, ordered by `created_at` descending.
9. THE SymCheck_Module SHALL expose a backend API endpoint `GET /api/symcheck/history/:id` that returns a single Assessment record, verifying the record belongs to the authenticated patient before returning it.

---

### Requirement 4: PDF Report Download

**User Story:** As a patient, I want to download a PDF report of any AI assessment, so that I can share the results with a healthcare provider.

#### Acceptance Criteria

1. WHEN a patient requests a PDF for an Assessment, THE SymCheck_Module SHALL generate and return a PDF file containing: the HMS branding header, patient name, assessment date and time, initial symptom description, diagnosis, Urgency_Level, confidence score, home remedies list, recommended actions list, and the disclaimer "NOT MEDICAL ADVICE — FOR INFORMATIONAL PURPOSES ONLY".
2. THE SymCheck_Module SHALL expose a backend API endpoint `GET /api/symcheck/report/:id` that generates and streams the PDF for the specified Assessment ID.
3. WHEN the PDF endpoint is called, THE SymCheck_Module SHALL verify that the Assessment belongs to the authenticated patient before generating the PDF.
4. IF the Assessment ID does not exist or does not belong to the authenticated patient, THEN THE SymCheck_Module SHALL return HTTP 403 with an error message.
5. WHEN the PDF is successfully generated, THE SymCheck_Module SHALL set the `Content-Disposition` header to `attachment; filename="symcheck_report_<id>.pdf"` so the browser triggers a file download.
6. THE PDF_Report SHALL apply urgency-appropriate colour coding: red text for `EMERGENCY`, orange text for `URGENT`, and green text for `NON-URGENT`.

---

### Requirement 5: AI Analytics Dashboard

**User Story:** As an admin or doctor, I want to view aggregate statistics about AI assessments across all patients, so that I can monitor usage patterns and identify trends in patient-reported symptoms.

#### Acceptance Criteria

1. THE SymCheck_Module SHALL provide an AI_Dashboard view accessible at `/symcheck/dashboard` for users with the `admin` or `doctor` role.
2. WHEN an admin or doctor navigates to `/symcheck/dashboard`, THE AI_Dashboard SHALL display: total number of AI assessments, a breakdown of assessments by Urgency_Level (EMERGENCY / URGENT / NON-URGENT counts), and a confidence score trend chart over time.
3. THE AI_Dashboard SHALL render the urgency breakdown as a donut or bar chart using a charting library already present in the project or a lightweight addition consistent with the HMS tech stack.
4. THE AI_Dashboard SHALL render the confidence trend as a line chart with dates on the x-axis and confidence percentage on the y-axis.
5. THE AI_Dashboard SHALL use StatsCard components consistent with the existing DashboardPage for the summary counts.
6. THE SymCheck_Module SHALL expose a backend API endpoint `GET /api/symcheck/stats` that returns: total assessment count, urgency breakdown counts, and an array of `{ date, confidence }` data points ordered by date ascending.
7. WHEN there are no assessments in the database, THE AI_Dashboard SHALL display zero values in the stats cards and empty-state messages in the chart areas.
8. THE AI_Dashboard SHALL be accessible from the existing HMS Sidebar navigation for `admin` and `doctor` roles, labelled "AI Analytics" with an appropriate icon.

---

### Requirement 6: Ollama Proxy Backend

**User Story:** As a developer, I want all Ollama LLM calls to be proxied through the Node.js/Express server, so that the React frontend never communicates with Ollama directly and API keys or local service URLs are not exposed to the browser.

#### Acceptance Criteria

1. THE Ollama_Proxy SHALL expose a backend API endpoint `POST /api/symcheck/analyze` that accepts a patient message and session ID, forwards the request to Ollama at `http://localhost:11434/api/generate` using the `gemma2:2b` model, and returns the structured analysis result to the frontend.
2. WHEN the Ollama_Proxy receives a request, THE Ollama_Proxy SHALL first invoke the Emergency_Detector logic server-side before calling Ollama.
3. IF the Emergency_Detector identifies an emergency, THEN THE Ollama_Proxy SHALL return an emergency response immediately without calling Ollama.
4. THE Ollama_Proxy SHALL maintain in-memory conversation session state keyed by session ID, storing the conversation history and accumulated symptom text for each active session.
5. WHEN a session produces a completed Assessment, THE Ollama_Proxy SHALL remove the session from in-memory state and persist the Assessment to the `ai_assessments` MySQL table.
6. IF Ollama is unreachable or returns a non-200 status, THEN THE Ollama_Proxy SHALL return HTTP 503 with a descriptive error message.
7. THE Ollama_Proxy SHALL set a request timeout of 60 seconds for all Ollama calls and return HTTP 504 if the timeout is exceeded.
8. THE SymCheck_Module SHALL create the `ai_assessments` MySQL table on server startup if it does not already exist, with columns: `id` (INT AUTO_INCREMENT PRIMARY KEY), `userId` (INT NOT NULL), `sessionId` (VARCHAR(100)), `symptoms` (TEXT), `conversation` (TEXT), `diagnosis` (TEXT), `urgency` (VARCHAR(50)), `confidence` (FLOAT), `homeRemedies` (TEXT), `recommendedActions` (TEXT), `createdAt` (DATETIME DEFAULT CURRENT_TIMESTAMP).

---

### Requirement 7: Navigation Integration

**User Story:** As a patient, admin, or doctor, I want the SymCheckAI features to appear in the existing HMS sidebar navigation, so that I can access them without any disruption to my existing workflow.

#### Acceptance Criteria

1. THE HMS Sidebar SHALL include a "Symptom Checker" navigation item linking to `/symcheck`, visible only to users with the `patient` role.
2. THE HMS Sidebar SHALL include an "AI Analytics" navigation item linking to `/symcheck/dashboard`, visible only to users with the `admin` or `doctor` role.
3. WHEN a user is on any `/symcheck` route, THE HMS Sidebar SHALL highlight the corresponding navigation item as active using the existing `bg-blue-50 text-blue-700` active style.
4. THE SymCheck_Module pages SHALL use the existing `<Navbar />` and `<Sidebar />` layout components, maintaining visual consistency with all other HMS pages.
5. THE HMS routing in `App.tsx` SHALL protect `/symcheck` and `/symcheck/history` routes with `ProtectedRoute` allowing only the `patient` role.
6. THE HMS routing in `App.tsx` SHALL protect `/symcheck/dashboard` with `ProtectedRoute` allowing only the `admin` and `doctor` roles.
