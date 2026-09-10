# Photo Magic

AI-powered product photography tool that transforms rough source photos into polished, catalog-ready ecommerce images using OpenAI's `gpt-image-2` model. Built for brands that need consistent, high-quality product shots at scale without a full studio setup.

Upload a phone snap of your product and get back a clean, professionally lit studio shot — on a model, as a product-only flat lay, or as a touch-up of the original photo.

---

## How It Works

Photo Magic operates in three shot modes, each built around a different ecommerce photography workflow:

### Product Shots
Generate clean product-only images with no model. Upload a source photo of your product and get back a studio-quality shot on a neutral background with professional lighting and shadow. The AI is explicitly constrained from adding human models, hands, or worn-on-body presentation.

### Model Shots
Generate AI model photography from flat-lay or mannequin source images. The system places your product on a realistic AI-generated model with configurable parameters:

- **Wearer type** — Mens, Womens, Youth, Toddler (with age-appropriate safety constraints for minors)
- **Framing** — Full body, Upper + face, Upper no face, Lower no face
- **Model profiles** — 28 pre-built model identities (8 mens, 8 womens, 6 youth, 6 toddler) with consistent appearance descriptions for visual continuity across a product line
- **Auto-rotate** — Automatically assigns one stable model identity per product group so all color variants of the same product use the same model

### Touch Ups
Clean up existing model/product photos taken with a phone or basic camera. The AI preserves the exact person, pose, product fit, logo, artwork, and composition while fixing:

- Harsh shadows and uneven lighting
- Cluttered or distracting backgrounds (standardized to `#EBEBEB` grey studio background)
- Camera noise, blur, and color cast
- Casual snapshot artifacts

Three cleanup intensity levels: **Light** (exposure/color only), **Standard** (lighting + background + artifacts), **Deep** (aggressive standardization).

---

## Architecture

```
bodybuilder/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Main layout: header + sidebar + workspace
│   │   ├── layout.tsx                  # Root layout with theme provider
│   │   ├── login/page.tsx              # Password auth gate
│   │   └── api/
│   │       ├── touch-up/route.ts       # Core: sends source + prompt to gpt-image-2
│   │       ├── upload/route.ts         # Receives source images, saves to Vercel Blob
│   │       ├── classify/route.ts       # Auto-labels images via gpt-4o-mini vision
│   │       ├── polish-prompt/route.ts  # Generates polished prompts from preset config
│   │       ├── scrape/route.ts         # Shopify collection scraper → ZIP download
│   │       ├── history/route.ts        # Persistent image history (CRUD)
│   │       ├── presets/route.ts        # Preset CRUD
│   │       ├── settings/route.ts       # Global settings persistence
│   │       ├── blob/route.ts           # Authenticated blob proxy
│   │       ├── blob-upload/route.ts    # Client-side blob upload handler
│   │       └── heartbeat/route.ts      # Connection health check
│   ├── components/
│   │   ├── workspace/
│   │   │   ├── workspace.tsx           # Main workspace: upload, process, review results
│   │   │   ├── image-drop-area.tsx     # Drag-and-drop + paste image upload
│   │   │   ├── image-result-card.tsx   # Result card with redo, regenerate, archive
│   │   │   └── upload-review-dialog.tsx# Pre-upload review: preset, grouping, view type
│   │   ├── parameters/
│   │   │   ├── parameter-sidebar.tsx   # Shot settings: preset, wearer, framing, model, notes
│   │   │   ├── preset-selector.tsx     # Preset dropdown with categories
│   │   │   └── preset-editor-dialog.tsx# Create/edit presets with AI prompt polishing
│   │   └── layout/
│   │       ├── settings-dialog.tsx     # Global settings: background, brand rules, processing
│   │       ├── collection-scraper.tsx  # Shopify URL → bulk image download
│   │       ├── theme-toggle.tsx        # Light/dark mode
│   │       └── heartbeat.tsx           # Connection status indicator
│   ├── stores/
│   │   ├── use-app-store.ts            # Zustand: photos, selections, presets, workspace state
│   │   ├── use-preset-store.ts         # Zustand: preset CRUD with server sync
│   │   └── use-settings-store.ts       # Zustand: processing settings (quality, size, format)
│   ├── lib/
│   │   ├── final-prompt.ts             # Assembles the complete prompt from preset + runtime params
│   │   ├── prompt-builder.ts           # Fallback prompt generation
│   │   ├── model-shot.ts              # Model profiles, wearer/pose options, group assignment
│   │   ├── touch-up.ts                # Touch-up strength/background options and prompts
│   │   ├── openai.ts                  # Singleton OpenAI client
│   │   ├── file-utils.ts             # Server-side file operations
│   │   ├── blob-utils.ts             # Vercel Blob helpers
│   │   ├── image-history.ts           # History persistence layer
│   │   ├── validation.ts             # Input validation, file size limits, sanitization
│   │   ├── constants.ts              # Default preset config, system presets
│   │   └── server-store.ts           # Server-side key-value store
│   └── types/
│       └── index.ts                   # TypeScript interfaces for the full data model
```

---

## Prompt System

The prompt pipeline is the core of Photo Magic. Every image generation is driven by a multi-layer prompt assembled at runtime:

1. **Polished Prompt** — When a preset is created, `gpt-4o-mini` rewrites the user's description into a structured generation prompt optimized for `gpt-image-2`
2. **Shot Mode Constraints** — Product shots get a "no human model" constraint; model shots get wearer/pose/framing instructions; touch-ups get preservation rules
3. **Model Profile** — For model shots, a specific model identity prompt is injected for visual consistency
4. **Brand Rules** — Global rules (set in Settings) are appended to every prompt. Example: "Preserve uploaded product design exactly. Do not change artwork, logo placement, colors, or graphic scale."
5. **Background Description** — Global studio setup description included in every prompt
6. **Additional Parameters** — Per-preset notes that persist across sessions. Example: "show the back logo, crop tighter"
7. **Regeneration Feedback** — When redoing a specific image, user feedback is appended as a fix instruction

---

## Key Features

- **Batch processing** — Upload up to 50 images at once with configurable parallelism (1-8 concurrent API calls)
- **Upload review dialog** — Before processing, review and configure each image's product group, view type (front/back/side/detail), and preset
- **Auto-labeling** — `gpt-4o-mini` vision classifies each uploaded image with a descriptive filename (e.g., `black-boardshorts-front`)
- **Per-image regeneration** — Type feedback like "remove wrinkles, brighter" directly on a result card to re-run with targeted fixes
- **Redo** — One-click re-process with the same prompt for a fresh generation
- **Cost tracking** — Real-time per-image and aggregate cost display based on OpenAI token usage rates
- **Image history** — Full persistent history with filtering by status, visibility (active/archived), and sort order
- **Export** — Select and bulk-download processed images
- **Shopify scraper** — Paste a Shopify collection URL to bulk-download all product images as a ZIP, organized by product folder
- **Dark/light theme** — System-aware with manual toggle
- **Password auth** — Simple token-based authentication via `APP_PASSWORD` env var

---

## Setup

### Prerequisites

- Node.js 18+
- An [OpenAI API key](https://platform.openai.com/api-keys) with access to `gpt-image-2` and `gpt-4o-mini`
- A [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) store for image storage

### Environment Variables

Create a `.env.local` in the `bodybuilder/` directory:

```env
OPENAI_API_KEY=sk-...
BLOB_READ_WRITE_TOKEN=vercel_blob_...
APP_PASSWORD=your-login-password
AUTH_SECRET=any-random-string-for-token-signing
```

### Install and Run

```bash
cd bodybuilder
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Log in with your `APP_PASSWORD`.

### Deploy

Deploy to Vercel with the same environment variables set in your project settings. The app uses Vercel Blob for all image storage, so it works out of the box on Vercel's infrastructure.

---

## Processing Settings

Configured in the Settings dialog (gear icon):

| Setting | Options | Default |
|---------|---------|---------|
| Quality | low, medium, high, auto | auto |
| Format | png, jpeg, webp | png |
| Size | 1024x1024, 1536x1024, 1024x1536 | 1024x1024 |
| Parallel | 1-8 concurrent jobs | 4 |
| Timeout | 60-600 seconds | 300 |

---

## Presets

Presets define the base prompt and shot mode for a product type. They're organized into three categories:

- **Product Shots** — Blanket, Hats, Mens Tops, Surfboard, etc.
- **Model Shots** — Sweatshorts, Toddler Top, Womens Top, etc.
- **Touch Ups** — General Touch Up (built-in system preset)

Each preset stores:
- Product type name and description
- Shot mode (product / model / touchup)
- AI-polished prompt (generated by `gpt-4o-mini` from the description)
- Persistent additional parameters (notes)

When creating a new preset, the prompt is automatically polished by the AI to produce consistent catalog-quality results across many different products of that type.

---

## Tech Stack

- **Framework** — Next.js 16 (App Router)
- **UI** — React 19, Tailwind CSS 4, shadcn/ui components, Lucide icons
- **State** — Zustand stores with localStorage persistence
- **AI** — OpenAI `gpt-image-2` (image generation/editing), `gpt-4o-mini` (classification, prompt polishing)
- **Storage** — Vercel Blob (private, authenticated)
- **Auth** — HMAC-signed tokens with 90-day expiry
- **Notifications** — Sonner toast system
