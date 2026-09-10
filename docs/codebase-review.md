# Code review and model expression changes

Reviewed September 10, 2026. Local baseline: `125a73b`. PR [#12](https://github.com/liambarness/photo-magic/pull/12) is merged and its reference-shuffling changes are present in this checkout. This was a source review plus automated regression checks; it was not a penetration test or a visual evaluation of generated photographs.

## Why PR #12 did not fully solve expression repetition

The existing editor already supported four reference images per human profile. PR #12 shuffled the entire set and asked for collective identity plus a fresh expression. Every generation still received the same references, with no concrete expression selection. The base prompt explicitly prohibited copying expressions. Shuffling alone could not reliably produce the requested variation.

The updated workflow stores up to 12 photos under one identity and offers three expression modes. Reference mode chooses a lead image and explicitly follows its expression. Varied mode samples a natural expression independently of reference expressions. Neutral mode requests a neutral expression. The first readable saved image anchors identity; at most one additional supporting angle is included. No more than three face references are sent alongside the product source.

The selected references and expression are recorded server-side on successful completion. A sequential redo avoids its previous successful lead reference or generated expression when alternatives exist. Separate batch images are independent random draws, so repeats across a batch remain possible. With one reference, choose Varied mode for expression diversity. The model is instructed to preserve facial anatomy and identity, not invent different facial features.

Legacy profiles default to Reference mode without a data migration. Existing Bob 1 / Bob 2 profiles are not merged or deleted automatically: add their photos to one Bob profile and select that profile for new uploads. Historical redo intentionally keeps the original model ID and uses its current saved references and expression preference.

## Bugs fixed

| Priority | Finding and trigger | Resolution |
| --- | --- | --- |
| P1 | `server-store.ts:updateModelProfile` only mapped saved profiles. A starter profile exists initially only in client defaults, so editing it returned success without saving anything. | Materialize the starter on first edit; return 404 for unknown custom IDs. |
| P1 | `blob-utils.ts:readBlobJson` converted storage outages, access failures, and malformed JSON into missing data. A subsequent write could replace saved profiles, settings, presets, or history with a partial/default collection. | Only a missing blob returns null; other failures propagate and prevent the write. |
| P1 | `api/history:DELETE` cleared all history for any request without an IDs array, including malformed JSON. | Reject malformed deletion requests with 400. |
| P2 | Profile editor called async store writes without awaiting them, showing success and closing even after a failed save. | Store methods return success/failure; editor awaits success before closing. Successful reference uploads survive retries. |
| P2 | Wearer-selection normalization searched starter profiles only, clearing compatible custom selections. | Include saved custom profiles in normalization. Remove unrelated menswear fallback when filtering profiles. |
| P2 | Deleted human model IDs silently generated without identity references. | Block missing model IDs before calling the paid generation API. |
| P2 | Reference resolution was based only on model ID and crop, allowing stale model settings to attach faces to another shot mode. | Explicit shot-mode gating; product shots and touch-ups never attach faces or expression guidance. |
| P2 | JPEG product sources ending in `.jpg` were sent as `image/png`. | Add the correct JPEG MIME mapping. |

## Remaining major issues

### P1: Concurrent instances can lose saved records

`src/lib/server-store.ts:44` and `src/lib/image-history.ts:36` serialize writes only within one process. Both persist whole JSON collections with overwrite enabled, with process-local caches. Two server instances can each read the same old data and overwrite each other's additions or completed generation costs/results. The 30-second/15-second caches increase this window. This affects the documented Vercel deployment and cannot be solved with another local promise lock.

Use transactional storage with one record per entity/job, or storage-level conditional writes with version checks and retry. No distributed concurrency test was run and persistence was not migrated in this change.

### P1: Scraper accepts arbitrary server-side fetch destinations

`src/app/api/scrape/route.ts:70` fetches a caller-supplied origin, follows redirects, and later fetches arbitrary image URLs from the returned JSON at line 122. There is no public-address validation or approved-host policy. An authenticated caller can direct requests toward hosts reachable by the server, including private services where networking permits. If `APP_PASSWORD` is missing, `src/proxy.ts:7` allows requests without authentication.

Constrain approved storefront/image hosts or validate public IP destinations and every redirect with DNS-rebinding protection. No private-network requests were made during this review.

### P1: Browser timeout does not cancel or reconcile generation

`src/components/workspace/workspace.tsx:316` aborts the browser request, while `src/app/api/touch-up/route.ts` calls the image provider without that signal or a durable job ID. The server can finish and incur cost after the UI reports failure. `src/lib/image-history.ts:284` then accepts a whole client snapshot and can overwrite that completed result/status/cost with stale state. Retrying can start another paid request. Redo also clears the previous preview before knowing the replacement succeeded.

Introduce idempotent server jobs and status polling. Make server completion/cost authoritative, reject stale client revisions, and preserve the last successful result until a replacement succeeds.

### P2: Scraper resource use is unbounded

`src/app/api/scrape/route.ts:31` has no page/product limit. Image bodies and the complete ZIP are buffered in memory, with no total byte limit or overall job deadline. A large collection or a server repeating full pages can exhaust time or memory despite per-request timeouts. Add pagination/product/byte limits and a streaming or background export workflow.

### P2: History truncation and orphaned uploads

`src/lib/image-history.ts:63` silently retains only 500 records. Old blob files are not removed or indexed elsewhere, so their history disappears while storage remains. Removing a face from a profile or deleting a profile also does not reclaim its uploaded references. Failed/cancelled workflows can leave unused uploads. Define retention and garbage collection with reference checks before deleting files.

### P2: Profile mutations can still race between editors/tabs

The profile store optimistically replaces the whole list and rolls back to a captured list on failure. Out-of-order responses from concurrent mutations can discard a newer client state. Awaiting the editor's save fixes the normal single-editor path but does not establish revision conflict handling between tabs/users. Use record revisions and conflict-aware updates alongside the persistence migration.

## Validation

- `npm test`: 21 passing regressions using mocked storage and image generation.
- `npm run lint`: passes.
- `npm run build`: passes, including TypeScript and route generation.
- Tests cover the 12-reference library, every possible lead, sequential redo, one-reference variation, neutral mode, legacy defaults, wearer selection, starter persistence, write failure reporting, storage outage handling, malformed deletion, request image ordering, unreadable references, missing models, and non-model/no-face exclusion.
- No real image generation, live storage writes, deployment, or visual browser acceptance test was performed. Provider likeness and expression quality are not guaranteed by these tests. A useful next acceptance check is several shots of the same product using one person's varied references, followed by single-reference Varied mode and a no-face control.


## Framing and prompt consistency follow-up

The initial variation change gated face use by body crop but did not account for rear/detail views. The follow-up adds `getModelShotContext` and `modelShotContextGuidance` as shared rules for upload validation, final prompts, image attachment selection, and generation-time instructions (including historical redo).

| Framing/view | Resolved behavior |
| --- | --- |
| Full body, front | Subtle expression; maintain head-to-toe crop. |
| Upper + face, front | Natural expression; garment remains dominant; no face close-up. |
| Side, face-visible crop | Adapt expression in profile; do not turn toward the reference camera angle. |
| Back, any crop | No face references or expression directions; upper + face becomes back-of-head through torso. |
| Detail, any crop | Product detail close-up overrides overall body framing; no face references or expression directions. |
| Upper/lower no-face | No face references or expression directions; styling cannot expand the crop. |
| Unknown view | Keep source product orientation; expression applies only if the face fits that source view and selected framing. Face-capable crops may still attach references because the view is not classified. Use explicit Back/Detail labels for deterministic attachment exclusion. |

Structured crop/view constraints are repeated last by the server, after expression directions and user feedback. Expression fixes can override random expression choices but cannot change the selected crop/view. Change the structured selection for a different composition. Neutral mode no longer generically asks to vary gaze/head position. The fallback prompt no longer asks to vary skin tone/identity, and preset polishing explicitly leaves expression/gaze/head position to runtime. Prompts longer than 8000 characters now fail validation rather than silently truncating trailing instructions.

The 21 regressions include all 20 crop/view combinations, prompt/input agreement, saved-view fallback on redo, conflicting styling/notes/feedback, neutral behavior, prompt-length rejection, and preset-polishing boundaries. These verify application behavior and instruction precedence, not guaranteed visual obedience by the image model. Existing free-text presets or descriptions can still contain contradictory prose; structured instructions take precedence without a risky wholesale rewrite of saved content. No paid image generation was performed.

## Rollback

This change requires no destructive data migration. A squash-merge can be undone with a standard Git revert of the merge commit, followed by deployment of that revert. Reverting code does not undo generated images, costs, or saved profile edits. The prior version recognizes only four references and can drop extra reference metadata when saving a larger profile; use at most four references during initial testing or avoid editing larger libraries on the reverted version. The additional expression preference and last-generation metadata are optional and can be ignored by the prior code.
