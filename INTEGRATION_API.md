# DescriptionMagic integration API (v1)

Configure **PHOTO_MAGIC_API_SECRET** with a long random secret, separate from APP_PASSWORD. Redeploy after setting it. Existing OPENAI_API_KEY and BLOB_READ_WRITE_TOKEN remain required. Desktop credentials contain the site base URL and this integration secret; never distribute the OpenAI or Blob token.

All endpoints require `Authorization: Bearer <PHOTO_MAGIC_API_SECRET>` over HTTPS, including image downloads. Browser cookies do not authorize these routes. Missing server secret returns 503; missing/wrong bearer returns 401. Download URLs are relative to the site base URL and are not public links. Never put the secret in query strings.

## Endpoints

- GET /api/integration/v1/options: ready presets (id, name, shotMode, description), model profiles without private face URLs, available wearer/pose/background/touch-up/view values, and request limits.
- POST /api/integration/v1/jobs: submit one product/color and one confirmed preset, with 1–4 images. JSON body limit is **3 MiB**, including base64. Downsize source images on the desktop as necessary, or split into smaller jobs. No remote source URLs are fetched; upload actual bytes for local and supplier images alike.
- GET /api/integration/v1/jobs/{jobId}: status and results, preserving product and candidate references.
- GET /api/integration/v1/jobs/{jobId}/images/{index}: authenticated image bytes for a completed result, index 0–3.

Submission example (replace IDs with values from /options):

```json
{
  "version": 1,
  "requestId": "fbe93716-02bd-46bb-9847-2976d34e7681",
  "product": {
    "reference": "desktop-product-key",
    "styleNumber": "SP2618A11",
    "colorCode": "KHA2"
  },
  "options": {
    "presetId": "saved-preset-id",
    "backgroundMode": "global",
    "notes": "Keep the original product color."
  },
  "images": [{
    "candidateId": "original-candidate-key",
    "sourceReference": "original vendor file or URL",
    "filename": "SP2618A11 KHA2 Large.png",
    "contentType": "image/png",
    "dataBase64": "<base64 image bytes without data URL prefix>",
    "viewType": "front"
  }]
}
```

Use a lowercase UUID for requestId. Required product fields are reference (nonempty), styleNumber, and colorCode (the latter two may be empty for manual sources). Every image requires all the illustrated fields; candidateId must be unique within a job. Unknown fields and invalid enums, base64, or JPEG/PNG/WebP signatures return 400. References are returned exactly, not inferred from AI labels.

Additional options: modelProfileId, modelWearerType, modelPoseType, touchUpStrength, touchUpBackground. Model mode requires an explicit model profile, matching wearer type, and valid face references when the selected framing shows a human face. Defaults: mens, full_body, standard touch-up, standard_gray touch-up background, global background, empty notes. Output size/quality/format come from Photo Magic settings. The server builds prompts using its saved preset, brand rules, background and profile; callers cannot submit arbitrary final prompts or change global settings.

Modes come from the selected preset: product = product-only presentation; model = selected wearer/profile/framing; touchup = improve an existing photo while preserving its person and pose. Touchup is not a generic flat-product cleanup mode. Send multiple views of the same product/color together to share one model profile; category suggestions and human confirmation belong in the desktop UI.

A 202 response:
```json
{"version":1,"jobId":"fbe93716-02bd-46bb-9847-2976d34e7681","statusUrl":"/api/integration/v1/jobs/fbe93716-02bd-46bb-9847-2976d34e7681","pollAfterSeconds":3}
```

Poll status about every three seconds. It returns version, jobId, product, complete, status, pollAfterSeconds, and images in original submission order. Each image includes candidateId, sourceReference, filename, viewType, status (pending/processing/done/error), error, estimated cost, and downloadUrl (null until done). Job status is processing, done, or completed_with_errors. Partial successes are downloadable immediately; wait for complete to know that all images have a terminal status. Review downloaded results alongside originals in dgImageUploader before adding/replacing and uploading.

Reuse the same requestId and identical parsed JSON after a lost submission response: an existing job returns 202 without reprocessing. Reusing the ID with different content returns 409 request_id_conflict. Preserve field order when retrying: the fingerprint uses JSON.stringify of the parsed request. A user-requested generation retry uses a new requestId and may incur a new charge; no paid generation is automatically retried.

## Execution and limitations

Jobs and per-image states persist in private Blob storage, independent of browser history. Status reads bypass Blob cache. Generation uses the same shared image-processing function as the web interface, with a 240-second request timeout and automatic SDK retries disabled for integration jobs. Images are processed concurrently after the response using Next.js after; the submit route requests a 300-second platform budget. Configure the deployment to allow that duration. This is bounded background execution, **not a durable queue**: shutdown or a platform timeout can interrupt processing. Pending/processing records older than ten minutes are reported as processing_interrupted. Existing results remain available, and re-submitting the same ID does not restart interrupted work. Check status before explicitly retrying under a new ID. No automatic retention/deletion policy is added; integration records are separate from the web history.

422 errors: preset_not_ready, invalid_model_profile, model_face_references_required. 413: request_too_large. 415: json_required. 503: storage_unavailable or integration_not_configured. Missing job/image returns 404. Download before completion returns 409 result_not_ready. Per-image generation_failed is deliberately generic; desktop drafts and originals should remain available.

The shared secret grants access to integration jobs across the installation; it is not per-user tenancy. Rotate it if compromised. Deployment verification with real credentials and a small image is required before desktop rollout. Local tests mock generation/storage and incur no image-generation charges.
