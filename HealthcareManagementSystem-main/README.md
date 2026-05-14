# Healthcare Management System

A full-stack healthcare management platform with AI-powered symptom checking, real-time messaging, video conferencing, and patient/doctor management.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Required Software](#required-software)
- [Installation](#installation)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [AI Setup (Ollama)](#ai-setup-ollama)
- [Running the Application](#running-the-application)
- [Default Login Accounts](#default-login-accounts)
- [Features Overview](#features-overview)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before setting up the application, ensure your machine meets the following requirements:

| Requirement | Minimum Version | Notes |
|-------------|----------------|-------|
| Node.js | 18.x or higher | [nodejs.org](https://nodejs.org) |
| npm | 9.x or higher | Comes with Node.js |
| MySQL | 8.0 or higher | [mysql.com](https://dev.mysql.com/downloads/) |
| Ollama | Latest | [ollama.com](https://ollama.com) |
| Modern Browser | Chrome / Edge / Firefox | Required for WebRTC video calls |

---

## Required Software

### 1. Node.js
Download and install from [nodejs.org](https://nodejs.org). Choose the **LTS** version.

Verify installation:
```bash
node --version
npm --version
```

### 2. MySQL
Download MySQL Community Server from [dev.mysql.com/downloads](https://dev.mysql.com/downloads/mysql/).

During installation:
- Set a root password (you will need this for the `.env` file)
- Keep the default port **3306**

Verify installation:
```bash
mysql --version
```

### 3. Ollama (for AI Symptom Checker)
Download from [ollama.com](https://ollama.com) and install.

After installation, pull the required model:
```bash
ollama pull gemma2:2b
```

This downloads approximately 1.6 GB. Ensure you have enough disk space.

---

## Installation

### Step 1 — Clone or copy the project

Place the project folder on your machine. The folder should be named `HealthcareManagementSystem-main`.

### Step 2 — Install dependencies

Open a terminal inside the project folder and run:

```bash
cd HealthcareManagementSystem-main
npm install
```

This installs all frontend and backend dependencies.

---

## Environment Configuration

Create or edit the `.env` file in the project root (`HealthcareManagementSystem-main/.env`):

```env
# Database connection
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASS=your_mysql_root_password
DB_NAME=healthcare_db

# Claude API key — used for image analysis in SymCheck (optional)
# Get your key from https://console.anthropic.com
CLAUDE_API_KEY=your_claude_api_key_here
```

Replace `your_mysql_root_password` with the password you set during MySQL installation.

> **Note:** The `CLAUDE_API_KEY` is optional. If not provided, the Symptom Checker will still work for text-based assessments using Ollama. It is only required when patients attach images to their symptom descriptions.

---

## Database Setup

The application **automatically creates the database and all tables** on first startup. You do not need to run any SQL scripts manually.

What happens automatically:
- Creates the `healthcare_db` database
- Creates all required tables (users, appointments, medical records, messages, etc.)
- Seeds default user accounts for testing

The only requirement is that MySQL is running and the credentials in `.env` are correct.

### Starting MySQL

**Windows:**
- Open Services (`Win + R` → `services.msc`) and start **MySQL80**
- Or use MySQL Workbench / MySQL Notifier

**macOS:**
```bash
brew services start mysql
```

**Linux:**
```bash
sudo systemctl start mysql
```

---

## AI Setup (Ollama)

### Start Ollama

Ollama must be running before starting the backend server.

```bash
ollama serve
```

If Ollama is already running (it auto-starts on some systems), you will see a message saying it is already listening. That is fine.

### Verify the model is available

```bash
ollama list
```

You should see `gemma2:2b` in the list. If not, pull it:

```bash
ollama pull gemma2:2b
```

### Verify Ollama is reachable

```bash
curl http://localhost:11434/api/tags
```

A JSON response with model information confirms Ollama is running correctly.

---

## Running the Application

The application has two parts that must run simultaneously — the backend server and the frontend dev server. Open **two separate terminals**.

### Terminal 1 — Backend Server

```bash
cd HealthcareManagementSystem-main
node Server.js
```

You should see:
```
Server running on port 5000
```

The server handles:
- REST API endpoints
- Socket.IO (real-time messaging and video call signalling)
- Database connection and auto-migration
- AI routing (Ollama for text, Claude for images)

### Terminal 2 — Frontend Dev Server

```bash
cd HealthcareManagementSystem-main
npm run dev
```

You should see:
```
VITE v5.x.x  ready in xxx ms
➜  Local:   http://localhost:5173/
```

Open your browser and navigate to **http://localhost:5173**

---

## Default Login Accounts

The following accounts are created automatically on first startup:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@hospital.com | admin123 |
| Doctor | doctor@hospital.com | doctor123 |
| Patient | patient@example.com | patient123 |

> You can create additional accounts via the Sign Up page.

---

## Features Overview

| Feature | Description |
|---------|-------------|
| **Dashboard** | Overview of patients, appointments, wards, and medical records |
| **Appointments** | Schedule and manage patient appointments |
| **Medical Records** | Create and view patient medical records |
| **Prescriptions** | Manage patient prescriptions and medications |
| **Lab Results** | Track and manage laboratory test results |
| **Messages** | Real-time messaging between doctors and patients with notifications |
| **Video Conference** | Peer-to-peer video calls between doctors and patients |
| **Symptom Checker (AI)** | AI-powered symptom assessment using Ollama (text) and Claude (images) |
| **Assessment History** | View past AI symptom assessments with PDF download |
| **AI Analytics** | Dashboard showing assessment statistics (admin/doctor only) |
| **Profile** | Edit profile details and upload a profile photo |

---

## Video Conferencing Notes

Video calls use **WebRTC** (peer-to-peer) with Socket.IO for signalling.

- Both users must be logged in at the same time in **separate browser tabs or windows**
- Use different browser profiles or one normal + one incognito window to test with two accounts
- Both users must be on the **same network** (calls work on localhost and LAN)
- The browser will request camera and microphone permission — click **Allow**

---

## Troubleshooting

### "Cannot connect to database"
- Ensure MySQL is running
- Check that `DB_USER`, `DB_PASS`, and `DB_HOST` in `.env` are correct
- Verify MySQL is listening on port 3306

### "The AI service is currently unavailable"
- Ensure Ollama is running: `ollama serve`
- Verify the model is downloaded: `ollama list`
- Check Ollama is reachable: `curl http://localhost:11434/api/tags`

### "Image analysis unavailable"
- Check that `CLAUDE_API_KEY` is set correctly in `.env`
- Restart `node Server.js` after editing `.env`
- Verify your Claude API key has remaining credit at [console.anthropic.com](https://console.anthropic.com)

### Video call notification not appearing
- Ensure both users are logged in on **different browser profiles** (not the same browser window)
- Check the server terminal for `[Video] Registered:` log lines — both users should appear
- Restart `node Server.js` to reset the online users map

### Port already in use
- Backend runs on port **5000** — ensure nothing else is using it
- Frontend runs on port **5173** — Vite will automatically try the next available port if occupied

### Session lost on refresh
- This is expected behaviour — the app uses `sessionStorage` for security
- Each browser tab maintains its own session
- Simply log in again after a refresh

---

## Project Structure

```
HealthcareManagementSystem-main/
├── Server.js              # Express backend + Socket.IO + AI routing
├── .env                   # Environment variables (DB credentials, API keys)
├── package.json           # Dependencies and scripts
├── src/
│   ├── api/               # Frontend API modules
│   ├── components/        # Reusable React components
│   │   ├── layout/        # Navbar, Sidebar
│   │   ├── ui/            # Buttons, Inputs, Modals
│   │   └── video/         # Video call overlay
│   ├── context/           # React contexts (Auth, WebSocket, VideoCall, Notifications)
│   ├── pages/             # Page components
│   └── types/             # TypeScript interfaces
└── index.html
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Tailwind CSS, Vite |
| Backend | Node.js, Express 5 |
| Database | MySQL 8 |
| Real-time | Socket.IO |
| AI (text) | Ollama + gemma2:2b (local, free) |
| AI (images) | Anthropic Claude claude-3-haiku-20240307 (API) |
| Video | WebRTC (peer-to-peer) |
| Charts | Recharts |
| PDF | PDFKit |
