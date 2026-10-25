# SpendSense — Project Context & System Audit

> **Generated**: October 25, 2026  
> **Status**: Comprehensive Takeover Audit & Documentation  
> **Repository Root**: `C:\Users\oneas\spendsense`

---

## 1. Project Purpose & High-Level Architecture

**SpendSense** is a premium, AI-powered personal cash-flow and finance dashboard designed with Indian Rupee (INR) integer paise calculations, an interactive 3D WebGL financial planet, a multi-appearance theme engine (Dark, Light, and Spider-Man), and an optional AI copilot ("Money Lens") powered by OpenAI with strict prompt injection defenses and server-side context validation.

### Architecture Summary

```
                      ┌────────────────────────────────────────┐
                      │              Next.js 16.4.2            │
                      │         (React 19 / Turbopack)         │
                      └──────────────────┬─────────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 │                                               │
       [Client-Side Experience]                        [Server-Side Services]
  ┌───────────────────────────────┐               ┌─────────────────────────────────┐
  │ • App Shell & Dashboard       │               │ • Route Handlers (/api/assistant│
  │ • 3D Financial Planet (R3F)   │               │   and /auth/callback)           │
  │ • Theme Engine & Switcher     │               │ • Proxy / Session Refresh       │
  │ • Money Lens Copilot UI       │               │ • Supabase SSR Server Client    │
  │ • Local Migration Panel       │               │ • OpenAI Responses Endpoint     │
  └──────────────┬────────────────┘               └────────────────┬────────────────┘
                 │                                                 │
                 ▼                                                 ▼
     ┌───────────────────────┐                         ┌───────────────────────┐
     │  Browser localStorage │                         │       Supabase        │
     │  - spendsense.finance │                         │  - Auth (Email/Pass)  │
     │  - theme / history    │                         │  - RLS-Protected DB   │
     └───────────────────────┘                         │  - RPC Reset Function │
                                                       └───────────────────────┘
```

* **Frontend**: Next.js App Router (v16.4.2), React 19, TypeScript 5, Tailwind CSS v4 with Turbopack, Framer Motion v14, Recharts v3.
* **Graphics**: Three.js (v0.186.1) and React Three Fiber (`@react-three/fiber` v9.8.2, `@react-three/drei` v10.7.9) with graceful HTML5 Canvas / CSS fallback boundaries when WebGL is absent or disabled.
* **Authentication & Backend Persistence**: Supabase (`@supabase/ssr` v0.12.7, `@supabase/supabase-js` v2.118.0) utilizing Row Level Security (RLS) constrained strictly to the authenticated user's `auth.uid()`.
* **AI Intelligence**: Server-side Money Lens assistant route (`/api/assistant`) integrating OpenAI with structured JSON Schema output, deterministic financial context generation, file byte sniffing, and prompt-injection mitigations.

---

## 2. Main Directories & Key Files

```
spendsense/
├── app/
│   ├── api/
│   │   └── assistant/route.ts      # Server-side Money Lens AI endpoint (OpenAI integration)
│   ├── auth/
│   │   ├── auth.css                # Authentication page specific styling
│   │   ├── callback/route.ts       # Supabase OAuth/email verification code exchange
│   │   ├── page.tsx                # Auth landing page (Sign in / Sign up)
│   │   └── reset-password/page.tsx # Password recovery and update page
│   ├── dashboard/
│   │   └── page.tsx                # Authenticated dashboard route with session claim checks
│   ├── favicon.ico / icon.svg      # App icons
│   ├── globals.css                 # Global styling, Tailwind imports, design tokens
│   ├── layout.tsx                  # Root layout, HTML theme hydration script, ThemeProvider
│   ├── page.tsx                    # Root re-export pointing to /auth/page
│   ├── planet-scene.tsx            # Three.js 3D interactive financial planet canvas
│   └── themes.css                  # Theme CSS variables, selector menu styling, overrides
├── components/
│   ├── auth-globe.tsx              # Three.js 3D ambient globe for authentication screen
│   ├── dashboard.tsx               # Main financial dashboard view, tabs, transactions, charts
│   ├── finance-assistant.tsx       # "Money Lens" chat panel, voice recognition, receipt upload
│   ├── financial-outlook.tsx       # Recurring expense detection & spending pace display
│   ├── local-migration-panel.tsx   # LocalStorage data import/review banner
│   ├── theme-provider.tsx          # React Context + useSyncExternalStore theme manager
│   └── theme-switcher.tsx          # Appearance dropdown component with Framer Motion glyphs
├── lib/
│   ├── assistant.ts                # AI schemas, draft validation, contextual data pruning
│   ├── assistant-context.ts        # Server-side ledger snapshot builder for AI
│   ├── finance.ts                  # Pure financial domain logic, INR cents, date calculations
│   ├── finance-repository.ts       # Supabase CRUD data operations, RLS queries, migrations
│   ├── financial-intelligence.ts   # Recurring expense heuristic & spend pace projection
│   ├── storage.ts                  # LocalStorage envelope serialization, defensive recovery
│   ├── theme-state.ts              # Theme constants, localStorage persistence, cycling
│   └── supabase/
│       ├── client.ts               # Browser Supabase client instantiation
│       ├── config.ts               # Public config validator (SUPABASE_URL, publishable key)
│       ├── database.types.ts       # TypeScript definitions for Supabase schema and RPC
│       ├── proxy.ts                # Session updater for Next.js proxy/middleware
│       └── server.ts               # Server-side Supabase client with cookie store
├── supabase/
│   └── migrations/
│       └── 20261024000100_spendsense_finance.sql # Complete DDL, RLS, triggers, indexes, RPC
├── tests/
│   └── finance.test.cjs            # Node.js native test suite (33 unit and integration tests)
├── .env.example                    # Template for required environment variables
├── .env.local                      # Local secrets and API configuration (uncommitted)
├── eslint.config.mjs               # ESLint configuration
├── next.config.ts                  # Next.js Turbopack & env configuration
├── package.json                    # Project dependencies, scripts, and metadata
├── proxy.ts                        # Root Next.js middleware proxy entrypoint
├── README.md                       # Setup, RLS verification, and data migration guide
└── tsconfig.json                   # TypeScript compiler options
```

---

## 3. Dependencies & Development Commands

### Core Dependencies
* **Framework**: `next@16.4.2`, `react@19.3.0`, `react-dom@19.3.0`
* **Styling & Motion**: `tailwindcss@^4`, `@tailwindcss/turbopack@^4`, `framer-motion@^14.3.0`
* **Icons & Visuals**: `lucide-react@^1.59.0`, `three@^0.186.1`, `@react-three/fiber@^9.8.2`, `@react-three/drei@^10.7.9`, `recharts@^3.10.1`
* **Backend & Auth**: `@supabase/ssr@^0.12.7`, `@supabase/supabase-js@^2.118.0`

### Development Commands
```bash
npm run dev        # Starts Next.js development server on http://localhost:3000
npm run build      # Produces optimized production build using Turbopack
npm run start      # Starts production server
npm test           # Runs node --test suite (tests/finance.test.cjs)
npm run lint       # Runs ESLint checks
npx tsc --noEmit   # Runs TypeScript static type analysis
```

---

## 4. Existing Features & Implementation Locations

| Feature | Primary Implementation Files | Description |
| :--- | :--- | :--- |
| **Authentication Flow** | `app/auth/page.tsx`, `app/auth/callback/route.ts`, `app/auth/reset-password/page.tsx`, `lib/supabase/client.ts` | Sign in, sign up, email confirmation callback, password reset via Supabase Auth. |
| **Session Middleware** | `proxy.ts`, `lib/supabase/proxy.ts`, `app/dashboard/page.tsx` | Next.js proxy route refreshes session cookies; dashboard gates unauthenticated users. |
| **Financial Ledger (CRUD)** | `lib/finance-repository.ts`, `components/dashboard.tsx`, `lib/finance.ts` | Transactions and budgets created, edited, deleted, and paginated with exact integer paise. |
| **Financial Planet** | `app/planet-scene.tsx`, `components/dashboard.tsx` | Interactive 3D Three.js sphere with category markers, orbit rings, and category filtering. |
| **Auth Ambient Globe** | `components/auth-globe.tsx`, `app/auth/page.tsx` | Procedurally textured 3D sphere with orbiting particles and fallback HTML5 canvas. |
| **Cash Flow Analytics** | `components/dashboard.tsx` (using `recharts`) | Income vs. expense area chart with custom tooltips, gradients, and period filtering. |
| **Financial Intelligence** | `lib/financial-intelligence.ts`, `components/financial-outlook.tsx` | Deterministic recurring expense detection (≥3 intervals) and linear month spending pace projection. |
| **Money Lens (AI Assistant)** | `app/api/assistant/route.ts`, `components/finance-assistant.tsx`, `lib/assistant.ts` | Structured AI chat, receipt image/PDF extraction, speech-to-text recognition, draft staging. |
| **Local Data Migration** | `components/local-migration-panel.tsx`, `lib/storage.ts`, `lib/finance-repository.ts` | Detects browser localStorage data, prompts user with explicit review, verifies import into Supabase without deleting local backup. |
| **Appearance & Theme Engine** | `components/theme-provider.tsx`, `components/theme-switcher.tsx`, `lib/theme-state.ts`, `app/themes.css` | View Transitions API with circular ripple animation, localStorage persistence, and inline anti-flicker script. |

---

## 5. Authentication & Supabase Integration Status

### Current Status: **Architecturally Complete; Remote Migration Must Be Verified**

* **Architecture**: The application follows modern Supabase SSR recommendations (`@supabase/ssr`) with separate browser and server client creators.
* **Authentication Features**:
  * Email and password sign-in and sign-up with client validation (minimum 10 characters for password).
  * Password reset link dispatch and `/auth/reset-password` handler.
  * Server-side route protection in `app/dashboard/page.tsx` via `supabase.auth.getClaims()`.
  * Cookie management handled via Next.js proxy (`proxy.ts`).
* **Persistence Status**:
  * Application queries query `finance_transactions` and `finance_budgets` with explicit `user_id` scoping.
  * Database RLS policies guarantee tenant isolation at the PostgreSQL layer.
* **Verification Note**: While all application code, TypeScript definitions, and SQL migrations are fully implemented, whether the migration has been pushed to the active remote Supabase project requires external verification against that specific Supabase instance.

---

## 6. Database Schema & Migration Status

### Migration File: `supabase/migrations/20261024000100_spendsense_finance.sql`

* **Tables**:
  * `public.finance_transactions`:
    * Columns: `id` (UUID PK), `user_id` (UUID FK -> auth.users), `source_id` (Text), `name` (Text 1-120), `category` (Enum check: 8 categories), `transaction_date` (Date), `amount_cents` (BigInt 1-1,000,000,000), `type` ('income' | 'expense'), `note` (Text ≤240), `payment_method` (Text ≤48), `created_at`, `updated_at`.
    * Constraints: `finance_transactions_owner_source_unique (user_id, source_id)`, category/type consistency check.
  * `public.finance_budgets`:
    * Columns: `id` (UUID PK), `user_id` (UUID FK -> auth.users), `source_id` (Text), `category` (Enum check: 7 expense categories), `limit_cents` (BigInt 1-1,000,000,000), `created_at`, `updated_at`.
    * Constraints: `finance_budgets_owner_source_unique (user_id, source_id)`, `finance_budgets_owner_category_unique (user_id, category)`.
* **Triggers & Functions**:
  * `enforce_posted_transaction_date()`: Rejects dates ahead of current date in `Asia/Kolkata` time zone.
  * `touch_finance_updated_at()`: Automatically refreshes `updated_at` timestamps on row mutation.
  * `replace_my_finance_data(jsonb, jsonb)`: Atomic account data reset RPC for demo restoration or full dataset replacements.
* **Row Level Security (RLS)**:
  * Force-enabled on both tables.
  * Explicit `SELECT`, `INSERT`, `UPDATE`, and `DELETE` policies enforcing `user_id = auth.uid()`.
  * Anon access revoked; authenticated role granted specific column permissions.

---

## 7. Existing API Integrations

All API integrations are strictly server-side and identified by environment variable NAME only:

| Variable Name | Service | Purpose | Exposure / Scope |
| :--- | :--- | :--- | :--- |
| `SUPABASE_URL` | Supabase | Project REST & Auth endpoint | Server & mapped to `NEXT_PUBLIC_` for browser |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase | Anon/Publishable API key (RLS constrained) | Server & mapped to `NEXT_PUBLIC_` for browser |
| `SUPABASE_SECRET_KEY` | Supabase | Service role administrative key | **Not used by application code** (Present in `.env.local`) |
| `SUPABASE_JWKS_URL` | Supabase | Token signing verification | **Not used by application code** (Present in `.env.local`) |
| `OPENAI_API_KEY` | OpenAI | Powers Money Lens assistant route (`/api/assistant`) | **Server-side only** (Never exposed to client) |
| `OPENAI_MODEL` *(Optional)* | OpenAI | Specifies model ID (defaults to `gpt-5.4-mini`) | Server-side only |

---

## 8. Financial Data Models & Persistence Mechanisms

### Financial Principles
* **Currency**: Indian Rupee (`INR`), formatted as `₹`.
* **Unit**: Exact integer cents / paise (`amountCents`, `limitCents`). Floating point math is strictly avoided; parsing converts string decimal inputs (`"0.10"`) directly to integer paise (`10`), and formatting occurs only at display boundaries.
* **Ceiling**: Maximum supported transaction or monthly budget is `1,000,000,000` cents (₹10,000,000.00).

### Data Preservation & Storage Safety
* **LocalStorage Keys**:
  * `spendsense.finance.v2`: Version 3 JSON envelope storing transactions and budgets.
  * `spendsense.transactions.v1` / `spendsense.budgets.v1`: Legacy v1 storage keys.
  * `spendsense.finance.recovery.v1:<timestamp>:<index>`: Immutable recovery snapshots created automatically whenever corrupted JSON, unsupported schema versions, or legacy migrations are encountered.
  * `spendsense.theme.v1`: User appearance preference (`"light"` | `"dark"` | `"spider-man"`).
  * `spendsense.assistant.history.v1`: Browser-local conversation history for Money Lens.
* **Data Loss Prevention**:
  * Account migration does **NOT** wipe browser localStorage data.
  * Failed saves do not overwrite existing envelopes.
  * Local records are never silently guessed, truncated, or discarded.

---

## 9. Theme Architecture & Visual Defects Audit

### Current Architecture
* Managed by `ThemeProvider` (`components/theme-provider.tsx`) with `useSyncExternalStore`.
* Utilizes native View Transitions API (`document.startViewTransition`) with radial clip-path animation centered on the triggering button (`--theme-reveal-x`, `--theme-reveal-y`, `--theme-reveal-radius`).
* Three themes configured in `lib/theme-state.ts`:
  1. `dark`: Obsidian surfaces and electric-lime accents.
  2. `light`: Soft neutral surfaces and clear contrast.
  3. `spider-man`: Midnight-blue surfaces, red and cyan accents.

### Identified Visual Defects (As Observed in Screenshots & Code Inspection)

1. **Theme Names and Descriptions Overlap in Selector**:
   * In `app/themes.css` (`.theme-option-copy`), `strong` and `small` elements lack explicit `line-height` definitions. In `app/globals.css`, global line-heights (`1.5`) and unconstrained grid rows cause description text to collide with theme title text.
2. **Inconsistent Icon and Graphic Sizing**:
   * Lucide icons (`<Sun size={16}>`, `<Moon size={16}>`) have hardcoded SVG pixel attributes, whereas the custom Spider-Man SVG mask in `ThemeGlyph` lacks width/height attributes and relies solely on CSS `.spider-glyph`. In flex/motion containers, this causes erratic glyph sizing.
3. **Oversized Spider-Man Mask**:
   * When `.spider-glyph` is animated by `framer-motion`'s `motion.span` or rendered without parent bounding constraints, the vector viewBox expands beyond the 16px/17px bounds.
4. **Spider-Man Mode Retains Too Much Lime Green**:
   * `app/globals.css` heavily uses hardcoded green values (`#c5f36c`, `#b8e86a`, `#18332138`, `#151f18`) rather than CSS variables (`var(--theme-accent)`, `var(--theme-line)`, etc.).
   * In Spider-Man theme:
     * Money Lens launcher button and full chat panel remain electric lime green.
     * Transaction table "Add" button, status indicators, and focus rings remain lime green.
     * `components/auth-globe.tsx` retains lime green `#a9c765` orbit rings.
     * Stat cards, outlook cards, and financial pace meter retain lime/peach styling.
     * `app/auth/auth.css` has almost no Spider-Man styling, leaving the auth visual, globe halos, and notices in original green.
5. **Cluttered Authentication Page Layout**:
   * `app/auth/auth.css` uses rigid pixel heights (`.auth-heading-block { height: 165px }`, `.auth-notice-slot { height: 48px }`, `.auth-form-slot { height: 310px }`, and `.auth-form { grid-template-rows: 61px 61px 61px 30px 45px }`).
   * When error notices, consent checkmarks, or missing configuration warnings render, elements collide and overflow.
   * Stacking logo, full theme pill, headings, tabs, notice, inputs, divider, local storage advisory, and footer creates a visually overwhelming column.
6. **Theme Selector Lacks Responsive Design**:
   * The dropdown `.theme-switcher-menu` has a static width `min(260px, calc(100vw - 28px))` with `right: 0`. Inside `.auth-shell` (which has `overflow: hidden`), the dropdown gets clipped on narrow viewports.
   * Options have small tap targets (padding 8px, 9px font size) failing mobile accessibility recommendations.

---

## 10. Test, Lint, Type-Check, and Build Results

Safe diagnostic commands were executed with zero side effects:

| Diagnostic Check | Command | Result | Notes |
| :--- | :--- | :--- | :--- |
| **Unit & Integration Tests** | `npm test` | **PASS (33 / 33 passed)** | 0 failed, 0 skipped, runtime ~5.1s |
| **Static Type Check** | `npx tsc --noEmit` | **PASS (0 errors)** | Exit code 0, complete type safety |
| **ESLint** | `npm run lint` | **PASS (0 warnings, 0 errors)** | Clean code style compliance |
| **Production Build** | `npm run build` | **PASS (Exit code 0)** | Turbopack compiled static & dynamic routes successfully |

---

## 11. Known Bugs & Security Considerations

### Security & Privacy Posture
* **Database Isolation**: Protected by Supabase Row Level Security (RLS) linked to `auth.uid()`.
* **API Key Safety**: `SUPABASE_SECRET_KEY` is present in `.env.local` but **is never referenced or exposed in client bundles**. `next.config.ts` explicitly maps only public/publishable variables.
* **Untrusted Receipt Data**: The AI route treats receipt images and PDFs as untrusted data, rejecting prompt injections and parsing only structured numbers/dates.
* **Zero Accidental Commit Risk**: No credentials or private tokens are hardcoded.

### Architectural Risks & Bugs
* **CSS Variable Fragility**: `app/globals.css` defines `:root` three separate times, causing cascading override ambiguities.
* **Strict Grid Form Slots**: `auth.css` rigidly templates 5 rows. Any dynamic content insertion (e.g. notices or extra validation errors) breaks grid alignment.
* **Uncommitted Workspace**: The repository root `spendsense` currently does not have an independent Git repository initialized (only parent `C:\Users\oneas` has an empty `.git`), meaning local changes must be tracked carefully to avoid accidental loss.

---

## 12. Prioritized Implementation Roadmap

### Phase 1: Theme Engine & Selector Polish (Immediate Priority)
1. **Fix Theme Selector Responsive Layout**:
   * Add explicit dimensions (`width={16} height={16}`) to the Spider-Man mask SVG in `components/theme-switcher.tsx`.
   * Set explicit `line-height: 1.3` and flexible spacing in `.theme-option-copy` to prevent title/description overlap.
   * Ensure `.theme-switcher-menu` positions within screen boundaries on mobile and does not get clipped by `.auth-shell` `overflow: hidden`.
   * Increase touch target sizes to meet minimum 44px mobile usability guidelines.

### Phase 2: Spider-Man Theme Visual Overhaul
1. **Complete Component Theming in `app/themes.css`**:
   * Replace hardcoded lime greens with dynamic theme variables across Money Lens assistant, stat cards, charts, transaction tables, and outlook cards.
   * Style the authentication page specifically for `auth-spider-man` (deep midnight background, spider-web background grid, red/cyan gradients).
   * Update `components/auth-globe.tsx` to color orbit rings with red/cyan in Spider-Man mode instead of lime green.
   * Add discoverable Spider-Man themed touches (e.g., subtle web motifs in card corners, spider-tracer glowing indicator).

### Phase 3: Authentication Layout De-Cluttering
1. **Clean Up `app/auth/page.tsx` & `app/auth/auth.css`**:
   * Replace fixed pixel heights (`165px`, `310px`) with fluid flex/grid auto-flow and clean gap spacing.
   * Simplify layout hierarchy, ensuring notices and consent checkboxes flow naturally without breaking layout containers.
   * Harmonize the top header theme switcher pill so it does not crowd the brand mark.

### Phase 4: Testing & Verification
1. Add component-level tests for theme switching and auth form responsiveness.
2. Conduct end-to-end user verification of Supabase RLS and live database persistence.

---

## 13. Safest Next Step

**Wait for User Approval.**
Per project instructions, no application code or design modifications will be made until the user reviews this context document and approves Phase 1 (Theme Selector & Spider-Man visual fixes).
