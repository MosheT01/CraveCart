# CraveCart

CraveCart is a hackathon MVP for an agentic food-shopping assistant. A user chats with a Gemini-powered agent that can use YouTube MCP tools, Kroger MCP tools, or both in the same turn.

The core product flows are:

- ask about a cooking video
- buy a simple grocery item like milk
- use a cooking video to build and buy a grocery list

## Architecture

- `web`: Next.js App Router app with the chat UI and Gemini agent host
- `youtube-mcp`: Python MCP service for YouTube search and transcript retrieval
- `kroger-mcp`: Python MCP service for Kroger auth state, product search, cart writes, and browser OAuth endpoints

For a fuller system walkthrough (including **Firebase sign-in**, **Firestore chat**, **Kroger OAuth**, and **session cookies**), see [ARCHITECTURE.md](./ARCHITECTURE.md).

The browser only talks to the Next.js app. **Firebase** handles email/password identity; the server sets an HTTP-only session cookie. **Kroger** tokens stay in the Kroger MCP service and are keyed by a separate opaque **`cravecart_session`** cookie.

## Stack

- Next.js App Router with TypeScript
- Tailwind CSS
- Gemini AI Studio via `@google/genai`
- MCP client in the web app via `@modelcontextprotocol/sdk`
- Python FastAPI + FastMCP services for YouTube and Kroger
- Zod validation
- Docker Compose for local full-stack runs

## Required Environment Variables

- `GEMINI_API_KEY`
- `GEMINI_MODEL` default `gemini-2.5-flash`
- `YOUTUBE_API_KEY`
- `KROGER_CLIENT_ID`
- `KROGER_CLIENT_SECRET`
- `KROGER_REDIRECT_URI`
- `KROGER_LOCATION_ID`
- `APP_BASE_URL`
- `INTERNAL_SIDECAR_SECRET` (required for Compose if you expose sidecars auth; matches GCP Secret **`INTERNAL_SIDECAR_SECRET`** in Cloud Run prod)

Firebase (auth + chat persistence):

- `FIREBASE_WEB_API_KEY` — Web app API key from the Firebase console
- `FIREBASE_SERVICE_ACCOUNT_PATH` — path to the Admin SDK JSON on disk (`pnpm dev` / local Node)
- `FIREBASE_SERVICE_ACCOUNT_JSON` — full JSON blob (production: Secret Manager → Cloud Run)
- `FIREBASE_SERVICE_ACCOUNT_HOST_PATH` — host path mounted into Docker Compose (`web` reads `/secrets/firebase-sa.json` inside the container)
- Optional: `FIREBASE_PROJECT_ID`, `FIREBASE_AUTH_DOMAIN` if not inferrable or non-default Auth domain

Optional local overrides:

- `KROGER_SIDECAR_URL`
- `KROGER_MCP_URL`
- `YOUTUBE_SERVICE_URL`
- `YOUTUBE_MCP_URL`

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in Gemini, YouTube, and Kroger values (including `KROGER_LOCATION_ID` for store-scoped search).
3. Ensure the Kroger developer console lists a redirect URI that exactly matches `KROGER_REDIRECT_URI`.

## Run Locally

### Full stack

```bash
docker compose up --build
```

Services:

- `web` on [http://localhost:3000](http://localhost:3000)

`youtube-mcp` and `kroger-mcp` are reachable only inside the Compose network (**not** mapped to host ports); set **`INTERNAL_SIDECAR_SECRET`** in `.env` so only the Next server can call them (see [docs/deploy-cloud-run.md](./docs/deploy-cloud-run.md)).

### Google Cloud Run (production)

See [docs/deploy-cloud-run.md](./docs/deploy-cloud-run.md) for Artifact Registry, Secret Manager, [cloudbuild.yaml](./cloudbuild.yaml), OAuth redirects, and scaling notes (`max-instances` on the web service).

### Web app only

This is only useful for UI work if you also point the app at running MCP services.

```bash
pnpm install
pnpm dev
```

## Chat API

### `POST /api/chat`

Streaming SSE-style endpoint used by the frontend chat UI.

Event types:

- `assistant_text_delta`
- `tool_call_started`
- `tool_call_finished`
- `needs_kroger_auth`
- `cart_ready`
- `error`

### `POST /api/crave`

Compatibility wrapper over the same agent engine for the original craving demo contract.

### `GET /api/health`

Reports Gemini config, YouTube config, MCP service health, whether Firebase Admin is configured, and non-sensitive deploy metadata (`service`, `revision`, `gitSha`, `checkedAt`) when set.

## Sign-in and chat storage

- **Auth:** Firebase Authentication (email/password) from the main page; password reset uses `/auth/reset-password` with Firebase `oobCode` handling.
- **Server session:** `POST /api/auth/session` exchanges a Firebase ID token for an HTTP-only cookie; `GET /api/auth/me` exposes the current user to the UI.
- **Chat history:** Stored in Firestore for signed-in users (`cravecart_user_chats`); deploy rules with `firebase deploy --only firestore:rules` ([`firebase.json`](./firebase.json), [`.firebaserc`](./.firebaserc) default project for the CLI).

## Kroger OAuth

The browser-facing OAuth routes remain in the Next app:

- `/auth/kroger`
- `/auth/kroger/callback`

Those routes talk to the Kroger MCP service for auth URL creation, code exchange, and token persistence.

## Example Flows

Try these messages:

- `I'm craving an American cheeseburger`
- `buy milk`
- `find a good chicken alfredo video and buy the groceries`

Expected cheeseburger flow:

1. The agent searches YouTube for a recipe video.
2. It retrieves transcript context when available.
3. If transcript retrieval fails, it loads the seeded fallback cheeseburger recipe.
4. It searches Kroger products for non-pantry ingredients.
5. It adds the selected items to the Kroger cart.
6. The UI ends on `Your Kroger cart is ready`.

## Tests

```bash
pnpm test
python -m unittest kroger-mcp/test_smoke.py
pnpm typecheck
pnpm build
```

Covered areas:

- craving normalization
- fallback recipe lookup
- Gemini extraction repair path
- deterministic product ranking
- explicit buy-intent guard
- tool-domain routing
- `/api/crave` compatibility mapping
- Kroger MCP auth-start and cart aggregation smoke tests

## Known Limitations

- YouTube transcripts are best-effort.
- Real Kroger cart writes require OAuth.
- The app uses a fixed configured Kroger location.
- Product matching is heuristic.
- Signed-in chat history is stored in Firebase Firestore (`cravecart_user_chats`); anonymous/local-only remnants may still migrate from `localStorage` once after login.
- The agent is intentionally domain-focused and will redirect unrelated prompts back toward food videos and grocery tasks.
