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

## Environment Variables

Required for Firebase Authentication:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=      # Firebase Web API Key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=  # your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=   # Firebase Project ID
```

## Setup

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

## Backend Integration

This frontend is designed to connect to external backend APIs:

- `/api/auth/me` - Get current user
- `/api/auth/session` - Create session from Firebase token
- `/api/auth/logout` - Logout
- `/api/chat` - Chat streaming endpoint
- `/api/chat-sessions` - Chat history CRUD
- `/api/kroger/auth/start` - Kroger OAuth initiation
- `/api/kroger/status` - Kroger connection status
- `/api/kroger/disconnect` - Disconnect Kroger

The UI will gracefully handle missing APIs and display appropriate messages.

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
