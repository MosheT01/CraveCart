# CraveCart (Frontend)

This is the **frontend-only** version of CraveCart, a hackathon MVP for an agentic food-shopping assistant.

## About

CraveCart is a Next.js application that provides a beautiful chat interface for a Gemini-powered food assistant. Users can:

- Ask about cooking videos
- Buy grocery items
- Build and buy grocery lists from cooking videos

## Demo

Walkthrough of CraveCart in action:

[![CraveCart demo — play on YouTube](https://img.youtube.com/vi/wS67vAFTe6k/maxresdefault.jpg)](https://youtu.be/wS67vAFTe6k)

**Watch:** [youtu.be/wS67vAFTe6k](https://youtu.be/wS67vAFTe6k)

## Stack

- Next.js 16 App Router with TypeScript
- Tailwind CSS v4
- Firebase Authentication (client-side)
- Radix UI primitives
- Lucide icons

## Project Structure

```
app/                     # Next.js pages and routes
  page.tsx               # Main chat interface
  auth/                  # Auth pages (kroger callback, reset password)
  layout.tsx             # Root layout with fonts/metadata
  globals.css            # Global styles and Tailwind config

components/              # React components
  LoginScreen.tsx        # Firebase auth login/signup
  Sidebar.tsx            # Chat history sidebar
  ChatInput.tsx          # Message input with examples
  AgentActivityPanel.tsx # Live agent activity display
  CartReadyCard.tsx      # Shopping cart summary
  VideoResultCard.tsx    # YouTube video result display
  OnboardingOverlay.tsx  # Product tour overlay
  KrogerConnectButton.tsx # Kroger OAuth connection
  ui/                    # Shared UI primitives

lib/                     # Utility libraries
  firebase/              # Firebase client auth
  chat/                  # Chat history utilities
  kroger/                # Kroger connect flow
  onboarding/            # Onboarding state
  types.ts               # TypeScript types
  utils.ts               # Shared utilities
```

---

## Connecting to Your Backend Infrastructure

This frontend is designed to work with the full CraveCart backend. Your backend consists of three services:

| Service | Purpose | Where It Runs |
|---------|---------|---------------|
| **web (backend)** | Next.js API routes + Gemini agent host | Cloud Run / Vercel |
| **youtube-mcp** | Python MCP server for YouTube search + transcripts | Cloud Run / Fly.io |
| **kroger-mcp** | Python MCP server for Kroger OAuth + cart | Cloud Run / Fly.io |

### Architecture Overview

```
┌─────────────────┐         ┌──────────────────────────────────────┐
│   This Frontend │ ──────► │       Backend (API Routes)           │
│   (Next.js UI)  │  HTTPS  │  • /api/auth/* (Firebase sessions)   │
└─────────────────┘         │  • /api/chat (Gemini + MCP)          │
                            │  • /api/chat-sessions (Firestore)    │
                            │  • /api/kroger/* (OAuth facade)      │
                            └──────────────────────────────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
              ┌──────────┐         ┌────────────┐        ┌────────────┐
              │ Firebase │         │ youtube-mcp│        │ kroger-mcp │
              │ Auth +   │         │ (Python)   │        │ (Python)   │
              │ Firestore│         └────────────┘        └────────────┘
              └──────────┘               │                     │
                                         ▼                     ▼
                                  ┌────────────┐        ┌────────────┐
                                  │ YouTube API│        │ Kroger API │
                                  │ Supadata   │        │ OAuth/Cart │
                                  └────────────┘        └────────────┘
```

### Option 1: Deploy Backend Separately (Recommended)

Deploy the full backend from the `main` branch of your repo, then point this frontend to it.

#### Step 1: Deploy Backend Services

Clone the `main` branch and follow [ARCHITECTURE.md](https://github.com/MosheT01/CraveCart/blob/main/ARCHITECTURE.md) to deploy:

```bash
# Clone the full repo with backend
git clone https://github.com/MosheT01/CraveCart.git cravecart-backend
cd cravecart-backend

# Option A: Docker Compose (local development)
docker compose up

# Option B: Cloud Run (production)
# See docs/deploy-cloud-run.md and cloudbuild.yaml
```

#### Step 2: Configure Environment Variables

Create `.env.local` in this frontend project:

```bash
# Firebase Client (required for login UI)
NEXT_PUBLIC_FIREBASE_API_KEY=your-firebase-web-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id

# Backend API URL (where your backend is deployed)
NEXT_PUBLIC_API_URL=https://your-backend.run.app
# Or for local development:
# NEXT_PUBLIC_API_URL=http://localhost:3001
```

#### Step 3: Update API Calls to Use Backend URL

The frontend currently makes relative API calls (e.g., `/api/chat`). To point to an external backend, update the fetch calls to use `NEXT_PUBLIC_API_URL`.

### Option 2: Hybrid Setup (Frontend + Backend in Same Repo)

Merge the backend code back into this repo:

```bash
# Add the main branch backend files
git remote add upstream https://github.com/MosheT01/CraveCart.git
git fetch upstream main
git checkout upstream/main -- app/api lib/agent lib/server lib/llm lib/kroger lib/api lib/recipes
git checkout upstream/main -- kroger-mcp youtube-mcp
git checkout upstream/main -- Dockerfile docker-compose.yml
```

Then add the backend dependencies back to `package.json`:

```bash
pnpm add firebase-admin @google/genai @modelcontextprotocol/sdk google-auth-library zod
```

### Backend Environment Variables

The backend requires these environment variables (see [.env.example](https://github.com/MosheT01/CraveCart/blob/main/.env.example)):

```bash
# Firebase Admin (server-side)
FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/firebase-adminsdk.json
# Or: FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
FIREBASE_WEB_API_KEY=your-web-api-key
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com

# App URL (must match browser URL)
APP_BASE_URL=https://your-app.vercel.app

# Gemini AI
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash

# YouTube (for video search + transcripts)
YOUTUBE_API_KEY=your-youtube-api-key
SUPADATA_API_KEY=your-supadata-key  # Optional but recommended

# Kroger (for grocery shopping)
KROGER_CLIENT_ID=your-kroger-client-id
KROGER_CLIENT_SECRET=your-kroger-client-secret
KROGER_REDIRECT_URI=https://your-app.vercel.app/auth/kroger/callback
KROGER_LOCATION_ID=your-store-location-id

# MCP Sidecar URLs
KROGER_SIDECAR_URL=http://kroger-mcp:8000
KROGER_MCP_URL=http://kroger-mcp:8000/mcp/
YOUTUBE_SERVICE_URL=http://youtube-mcp:8100
YOUTUBE_MCP_URL=http://youtube-mcp:8100/mcp/

# Sidecar Auth (production)
INTERNAL_SIDECAR_SECRET=shared-secret-for-sidecar-auth
```

### API Endpoints Expected

This frontend calls these backend API routes:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/me` | GET | Get current signed-in user |
| `/api/auth/session` | POST | Exchange Firebase ID token for session cookie |
| `/api/auth/logout` | POST | Clear session cookie |
| `/api/firebase-public-config` | GET | Get Firebase web SDK config |
| `/api/chat` | POST | Stream chat with Gemini agent (SSE) |
| `/api/chat-sessions` | GET | List user's chat sessions |
| `/api/chat-sessions` | POST | Import/create chat sessions |
| `/api/chat-sessions/[id]` | GET | Get session messages |
| `/api/chat-sessions/[id]` | DELETE | Delete a session |
| `/api/kroger/auth/start` | GET | Get Kroger OAuth URL |
| `/api/kroger/status` | GET | Check Kroger connection status |
| `/api/kroger/disconnect` | POST | Disconnect Kroger account |
| `/api/health` | GET | Service health check |

### SSE Event Protocol

The `/api/chat` endpoint streams these events:

```typescript
// Text delta from assistant
{ event: "assistant_text_delta", data: { delta: string } }

// Tool execution started
{ event: "tool_call_started", data: { tool: string, args: object } }

// Tool execution finished
{ event: "tool_call_finished", data: { tool: string, result: object } }

// Kroger OAuth needed
{ event: "needs_kroger_auth", data: { authUrl: string } }

// Cart ready to view
{ event: "cart_ready", data: { items: CartItem[], total: number } }

// Error occurred
{ event: "error", data: { message: string } }
```

### Cookies Used

| Cookie | Purpose |
|--------|---------|
| `cravecart_fb_session` | Firebase session cookie (HTTP-only, set by backend) |
| `cravecart_session` | Kroger MCP session affinity (opaque ID) |

---

## Local Development Setup

1. Install dependencies:

```bash
pnpm install
```

2. Create `.env.local` with your Firebase config:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
```

3. Run the development server:

```bash
pnpm dev
```

## Scripts

```bash
pnpm dev        # Start development server
pnpm build      # Build for production
pnpm start      # Start production server
pnpm typecheck  # Run TypeScript checks
```

## Features

- Beautiful glass-morphism UI with cinematic effects
- Real-time chat streaming interface
- Firebase email/password authentication
- Kroger OAuth integration (UI ready)
- Chat session history with sidebar
- Product onboarding tour
- Responsive design for mobile and desktop

## License

MIT
