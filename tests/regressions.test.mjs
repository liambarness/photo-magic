import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { selectModelVariation, modelVariationGuidance } = loadTs('src/lib/model-expression.ts');
const { normalizeModelProfile, normalizeModelProfileSelection } = loadTs('src/lib/model-shot.ts');
const refs = Array.from({ length: 12 }, (_, i) => ({ id: `ref-${i}`, name: `${i}.jpg`, url: `https://example.com/${i}.jpg` }));
const profile = { id: 'bob', name: 'Bob', kind: 'human', wearerType: 'mens', prompt: '', styling: '', faceReferences: refs };

test('12-image library is retained and old profiles gain reference expression mode', () => {
  const normalized = normalizeModelProfile(profile);
  assert.equal(normalized.faceReferences.length, 12);
  assert.equal(normalized.expressionMode, 'reference');
});

test('every library image can lead; anchor retained, at most 3 distinct face inputs', () => {
  for (let i = 0; i < 12; i++) {
    const result = selectModelVariation(profile, refs, undefined, () => (i + 0.1) / 12);
    assert.equal(result.references[0].id, refs[i].id);
    assert.ok(result.references.some((r) => r.id === refs[0].id));
    assert.ok(result.references.length <= 3);
    assert.equal(new Set(result.references.map((r) => r.id)).size, result.references.length);
  }
});

test('redo avoids last successful lead for the same identity', () => {
  const first = selectModelVariation(profile, refs, undefined, () => 0);
  const next = selectModelVariation(profile, refs, first.generation, () => 0);
  assert.notEqual(first.references[0].id, next.references[0].id);
});

test('one reference works; varied expression changes on redo', () => {
  const varied = { ...profile, expressionMode: 'varied' };
  const first = selectModelVariation(varied, refs.slice(0, 1), undefined, () => 0);
  const next = selectModelVariation(varied, refs.slice(0, 1), first.generation, () => 0);
  assert.equal(next.references.length, 1);
  assert.notEqual(first.generation.expression, next.generation.expression);
});

test('neutral and no-reference modes preserve intended behavior', () => {
  const neutral = selectModelVariation({ ...profile, expressionMode: 'neutral' }, refs);
  assert.match(neutral.generation.expression, /neutral/);
  const ai = selectModelVariation({ ...profile, kind: 'ai' }, []);
  assert.equal(ai.references.length, 0);
  assert.doesNotMatch(ai.generation.expression, /Image 2/);
  assert.match(modelVariationGuidance(ai.generation), /Preserve the selected model/);
});

test('custom profile selection survives same wearer and clears for incompatible wearer', () => {
  assert.equal(normalizeModelProfileSelection('bob', 'mens', [profile]), 'bob');
  assert.equal(normalizeModelProfileSelection('bob', 'toddler', [profile]), '');
});

test('starter customization persists rather than returning unchanged data', async () => {
  let saved;
  const store = loadTs('src/lib/server-store.ts', { '@/lib/blob-utils': {
    readBlobJson: async () => [], putBlob: async (_key, data) => { saved = JSON.parse(data); },
  } });
  const result = await store.updateModelProfile('starter_mens_01', { name: 'Custom starter', faceReferences: refs, kind: 'human' });
  assert.equal(result[0].name, 'Custom starter');
  assert.equal(saved[0].faceReferences.length, 12);
  assert.equal(await store.updateModelProfile('deleted', { name: 'Missing' }), null);
});

test('JSON reads only treat missing blobs as absent; outages and corrupt JSON throw', async () => {
  class Missing extends Error {}
  let get = async () => null;
  const blobs = loadTs('src/lib/blob-utils.ts', { '@vercel/blob': { BlobNotFoundError: Missing, get: (...args) => get(...args) } });
  assert.equal(await blobs.readBlobJson('data.json'), null);
  get = async () => { throw new Error('Service unavailable'); };
  await assert.rejects(blobs.readBlobJson('data.json'), /Service unavailable/);
  get = async () => ({ stream: new Response('{bad').body, blob: {} });
  await assert.rejects(blobs.readBlobJson('data.json'), SyntaxError);
});

test('malformed history deletion cannot clear all history', async () => {
  let deleted = false;
  const route = loadTs('src/app/api/history/route.ts', {
    '@/lib/image-history': { deleteImageHistoryItems: async () => { deleted = true; return 0; } },
  });
  const response = await route.DELETE(new Request('http://local/api/history', { method: 'DELETE', body: '{broken' }));
  assert.equal(response.status, 400);
  assert.equal(deleted, false);
});

function generationRoute({ shotMode = 'model', pose = 'upper_face_visible', view = 'unknown', requestView = view, omitRequestView = false, prompt = 'Preserve the product', missing = [], profiles = [profile] } = {}) {
  let edit;
  let completed;
  const route = loadTs('src/app/api/touch-up/route.ts', {
    '@/lib/openai': { getOpenAIClient: () => ({ images: { edit: async (params) => { edit = params; return { data: [{ b64_json: 'aW1hZ2U=' }] }; } } }) },
    '@/lib/file-utils': { saveFile: async () => 'https://example.com/result.png' },
    '@/lib/image-history': {
      getImageHistoryItem: async () => ({ usedSettings: { shotMode, modelProfileId: 'bob', modelPoseType: pose, viewType: view }, lastModelGeneration: { profileId: 'bob', referenceIds: ['ref-0'], expression: '' } }),
      completeImageHistoryItem: async (value) => { completed = value; },
    },
    '@/lib/server-store': { getModelProfiles: async () => profiles },
    '@/lib/blob-utils': {
      readBlob: async (url) => { if (missing.includes(url)) throw new Error('missing'); return { buffer: Buffer.from('image'), contentType: 'image/jpeg' }; },
      blobServingUrl: (url) => url,
    },
  });
  return { run: () => route.POST(new Request('http://local/api/touch-up', { method: 'POST', body: JSON.stringify({ shotMode, photoId: 'photo-123', folder: 'batch', sourceUrl: 'https://example.com/source.jpg', prompt, modelProfileId: 'bob', modelPoseType: pose, viewType: omitRequestView ? undefined : requestView }) })), inspect: () => ({ edit, completed }) };
}

test('generation sends product first, chosen expression reference second, and records choice', async () => {
  const route = generationRoute();
  assert.equal((await route.run()).status, 200);
  const { edit, completed } = route.inspect();
  assert.equal(edit.image[0].name, 'source.jpg');
  assert.equal(edit.image[0].type, 'image/jpeg');
  assert.ok(edit.image.length <= 4);
  assert.match(edit.prompt, /expression shown in Image 2/);
  assert.notEqual(completed.lastModelGeneration.referenceIds[0], 'ref-0');
});

test('touch-ups and no-face shots never attach reference faces or expression directions', async () => {
  for (const options of [{ shotMode: 'touchup' }, { shotMode: 'product' }, { pose: 'lower_no_face' }]) {
    const route = generationRoute(options);
    assert.equal((await route.run()).status, 200);
    assert.ok(route.inspect().edit.image instanceof File);
    assert.doesNotMatch(route.inspect().edit.prompt, /Expression direction/);
  }
});

test('unreadable references fall back; entirely missing references block paid generation', async () => {
  const some = generationRoute({ missing: refs.slice(0, 11).map((r) => r.url) });
  assert.equal((await some.run()).status, 200);
  assert.deepEqual(some.inspect().completed.lastModelGeneration.referenceIds, ['ref-11']);
  const all = generationRoute({ missing: refs.map((r) => r.url) });
  assert.equal((await all.run()).status, 400);
  assert.equal(all.inspect().edit, undefined);
});

test('deleted profile blocks generation instead of silently creating a different identity', async () => {
  const route = generationRoute({ profiles: [] });
  assert.equal((await route.run()).status, 400);
  assert.equal(route.inspect().edit, undefined);
});

test('profile API persists expression preference and all 12 references', async () => {
  let saved;
  const api = loadTs('src/app/api/model-profiles/route.ts', {
    '@/lib/server-store': { saveModelProfile: async (value) => { saved = value; return [value]; } },
  });
  const response = await api.POST(new Request('http://local/api/model-profiles', { method: 'POST', body: JSON.stringify({ ...profile, expressionMode: 'varied' }) }));
  assert.equal(response.status, 200);
  assert.equal(saved.expressionMode, 'varied');
  assert.equal(saved.faceReferences.length, 12);
});

test('profile store reports failed writes and retains the prior profile', async () => {
  const priorFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('Failed', { status: 500 });
    const { useModelProfileStore } = loadTs('src/stores/use-model-profile-store.ts', { sonner: { toast: { error() {}, message() {} } } });
    useModelProfileStore.setState({ profiles: [profile] });
    assert.equal(await useModelProfileStore.getState().updateProfile('bob', { name: 'Changed' }), false);
    assert.equal(useModelProfileStore.getState().getProfile('bob').name, 'Bob');
    assert.equal(await useModelProfileStore.getState().addProfile({ ...profile, id: 'new' }), false);
    assert.equal(useModelProfileStore.getState().getProfile('new'), undefined);
  } finally { globalThis.fetch = priorFetch; }
});

const { getModelShotContext } = loadTs('src/lib/model-shot.ts');
const { buildFinalPrompt } = loadTs('src/lib/final-prompt.ts');
const poses = ['full_body', 'upper_face_visible', 'upper_no_face', 'lower_no_face'];
const views = ['front', 'back', 'side', 'detail', 'unknown'];
const modelPreset = { id: 'preset', name: 'Top', shotMode: 'model', polishedPrompt: 'Catalog product photo.', description: '' };
function config(pose) {
  return { presetId: 'preset', notes: '', modelWearerType: 'mens', modelPoseType: pose, modelProfileId: 'bob', touchUpStrength: 'standard', touchUpBackground: 'standard_gray', backgroundMode: 'global' };
}

test('all 20 framing/view combinations agree between prompt, context, and image attachments', async () => {
  for (const pose of poses) for (const view of views) {
    const expected = ['full_body', 'upper_face_visible'].includes(pose) && !['back', 'detail'].includes(view);
    const context = getModelShotContext(pose, view);
    assert.equal(context.usesFace, expected, `${pose}/${view}`);
    const prompt = buildFinalPrompt(modelPreset, config(pose), { viewType: view, allProfiles: [profile] });
    assert.equal(prompt.includes('Use the attached face reference images collectively'), expected, `${pose}/${view}`);
    const route = generationRoute({ pose, view, prompt });
    assert.equal((await route.run()).status, 200, `${pose}/${view}`);
    const edit = route.inspect().edit;
    assert.equal(Array.isArray(edit.image), expected, `${pose}/${view}`);
    assert.equal(edit.prompt.includes('Expression direction for this generation:'), expected, `${pose}/${view}`);
    if (view === 'back' && pose === 'upper_face_visible') {
      assert.doesNotMatch(prompt, /with the face visible/);
      assert.match(prompt, /back of the head through the torso/);
    }
    if (view === 'detail') {
      assert.match(prompt, /Detail view takes precedence/);
      assert.doesNotMatch(prompt, /Frame the complete model head to toe/);
    }
  }
});

test('full and upper crops have distinct expression constraints; neutral does not ask to vary gaze', () => {
  const generation = selectModelVariation({ ...profile, expressionMode: 'neutral' }, refs).generation;
  assert.match(modelVariationGuidance(generation, 'full_body', 'front'), /subtle at full-body scale/);
  assert.match(modelVariationGuidance(generation, 'upper_face_visible', 'front'), /garment as the focus/);
  assert.match(modelVariationGuidance(generation, 'full_body', 'side'), /face must stay in profile/);
  assert.match(modelVariationGuidance(generation, 'full_body', 'front'), /relaxed and neutral/);
  assert.equal(modelVariationGuidance(generation, 'full_body', 'back'), '');
  assert.equal(modelVariationGuidance(generation, 'upper_face_visible', 'detail'), '');
});

test('redo uses saved back view when request omits it, despite stale face-visible prompt', async () => {
  const route = generationRoute({ view: 'back', omitRequestView: true, prompt: 'Show a face close-up and copy the face references.' });
  assert.equal((await route.run()).status, 200);
  const edit = route.inspect().edit;
  assert.ok(edit.image instanceof File);
  assert.match(edit.prompt, /Authoritative framing and view: Frame the back of the head/);
  assert.ok(edit.prompt.endsWith('Ignore earlier face-reference instructions; no face images are attached.'));
});

test('framing/view takes priority over conflicting styling, notes, and feedback', async () => {
  const prompt = buildFinalPrompt(modelPreset, { ...config('lower_no_face'), notes: 'Zoom out to show face and shoes' }, { allProfiles: [{ ...profile, styling: 'Show the hat' }], viewType: 'front' });
  assert.ok(prompt.indexOf('Authoritative framing and view:') > prompt.indexOf('IMPORTANT additional parameters:'));
  assert.match(prompt, /Styling applies only within the selected crop/);
  const route = generationRoute({ pose: 'lower_no_face', view: 'front', prompt: `${prompt} IMPORTANT fix requested: show the face.` });
  assert.equal((await route.run()).status, 200);
  assert.ok(route.inspect().edit.prompt.lastIndexOf('Authoritative framing and view:') > route.inspect().edit.prompt.indexOf('IMPORTANT fix requested:'));
});

test('oversized prompts are rejected instead of silently dropping instructions', async () => {
  const route = generationRoute({ prompt: 'x'.repeat(8001) });
  assert.equal((await route.run()).status, 400);
  assert.equal(route.inspect().edit, undefined);
});

test('fallback and preset polishing defer identity/expression/framing to runtime', async () => {
  const { buildFallbackPrompt } = loadTs('src/lib/prompt-builder.ts');
  assert.doesNotMatch(buildFallbackPrompt(modelPreset), /Vary model skin tone/);
  let params;
  const route = loadTs('src/app/api/polish-prompt/route.ts', {
    '@/lib/openai': { getOpenAIClient: () => ({ chat: { completions: { create: async (value) => { params = value; return { choices: [{ message: { content: 'Catalog photo' } }] }; } } } }) },
  });
  await route.POST(new Request('http://local/api/polish-prompt', { method: 'POST', body: JSON.stringify({ presetName: 'Top', shotMode: 'model', framing: 'face close-up' }) }));
  assert.match(params.messages[0].content, /facial expression, gaze, or head position/);
  assert.doesNotMatch(params.messages[1].content, /Framing:/);
});
