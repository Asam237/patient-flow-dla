# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A real-time patient queue management system ("Système de Gestion de File d'Attente") for a medical facility, built with Next.js 13 (App Router), TypeScript, Tailwind CSS, shadcn/ui, and Firebase (Auth + Firestore). The UI, code comments, and commit history are primarily in French; user-facing copy should generally stay in French unless told otherwise.

## Commands

```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build
npm run start         # Start production server
npm run lint          # next lint
npm run typecheck     # tsc --noEmit
```

There is no test suite/runner configured in this repo. Deploys are configured for Netlify (`netlify.toml`, `@netlify/plugin-nextjs`).

## Environment

Firebase config lives in `lib/firebase.ts` and reads `NEXT_PUBLIC_FIREBASE_*` vars (see `.env.example`), but it also hard-codes a fallback config object so the app can run without an `.env.local`. When changing Firebase config/behavior, be aware both paths exist. Full manual setup steps (Firestore rules, initial `queue_state` doc, first admin account) are documented in `FIREBASE_SETUP.md`.

## Architecture

### Routing / roles
- `/` — redirect-only page; sends `admin` role to `/admin`, everyone else to `/assistant`.
- `/login` — single login entry point for all roles. On an already-authenticated visit it redirects: `admin`/`dispatching` → `/admin`, everyone else → `/assistant`.
- `/assistant` — dashboard for calling/completing queue numbers.
- `/admin` — assistant account management + queue administration. Also used by the `dispatching` role (a restricted admin-like role — check `isDispatching` checks in `app/admin/page.tsx` before changing permissions there).
- `/display` — public, unauthenticated real-time screen showing current/next numbers and assistant status.

There are three `UserRole`s (`lib/types.ts`): `admin`, `assistant`, `dispatching`. `dispatching` was added after the original two-role design in `README.md`/`FIREBASE_SETUP.md` — those docs are stale on this point; treat `lib/types.ts` and `app/admin/page.tsx` as the source of truth for role behavior.

### Two-block queue system
The queue is partitioned into two independent blocks, `"block a"` and `"block b"`, each with its own current/next ticket pointer. This is layered on top of a single-block legacy shape:
- `QueueState` (`lib/types.ts`) has both the legacy flat fields (`currentNumber`, `nextNumber`, `currentAssistantId`) and per-block fields (`currentNumberA/B`, `nextNumberA/B`, `currentAssistantIdA/B`). Firestore doc `queue_state/current` is written with both sets kept in sync — don't add new queue-state fields without updating the corresponding `A`/`B` variants too.
- Ticket numbers are integers; `formatNumberToCode()` in `lib/queue-service.ts` renders them as letter-coded display strings (`A00`–`A99`, `B00`–`B99`, ...) — the letter is `floor(number / 100)`.
- A user's `block` (`"block a" | "block b"`) is derived from `startNumber` (`>= 100` ⇒ block b) at account-creation time in `createAssistantAccount()` (`lib/auth-service.ts`) and re-derived defensively in `mapUser()` (`lib/queue-hooks.ts`) if the stored `block` field is missing.
- Block-aware queue operations (`callNextNumber`, `completeCurrentNumber`, `getNextWaitingNumber`, `resetQueue`) all take an optional `block` param and filter/sort client-side — Firestore composite indexes are intentionally avoided (see note in `FIREBASE_SETUP.md`); don't introduce a query that would need one without checking this constraint still holds.

### Firestore access layer
All Firestore reads/writes go through `lib/`, not directly from components:
- `lib/firebase.ts` — app/db/auth singleton init.
- `lib/auth-service.ts` — account creation (admin/assistant/dispatching), sign in/out, `getUserProfile`.
- `lib/auth-context.tsx` — `AuthProvider`/`useAuth()`, wraps Firebase auth state + Firestore user profile into one context (mounted in `app/layout.tsx`).
- `lib/queue-service.ts` — one-shot queue mutations/reads (`addNumberToQueue`, `callNextNumber`, `completeCurrentNumber`, `deleteQueueNumber`, `resetQueue`, `getAllQueueNumbers`, `getQueueState`).
- `lib/queue-hooks.ts` — real-time subscriptions via `onSnapshot` (`useQueueNumbers`, `useQueueState`, `useUsers`), each with its own Firestore-document-shape mapper (keep these mappers' defaulting/fallback logic in sync with `queue-service.ts` when the Firestore document shape changes).

Collections: `users`, `queue_numbers`, `queue_state` (single doc, id `current`). Firestore security rules: public read on `queue_numbers`/`queue_state`, write requires auth; `users` writes are self-only. See `FIREBASE_SETUP.md` for the exact rules text.

### UI
`components/ui/` is shadcn/ui (generated — prefer adding new primitives via shadcn conventions over hand-rolling). Path alias `@/*` maps to repo root (`tsconfig.json`). `next.config.js` disables ESLint-during-build and image optimization (static export-friendly, matches Netlify hosting).
