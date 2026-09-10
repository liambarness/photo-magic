import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { faceReferenceGuidance, MODEL_CONTINUITY_GUIDANCE } = loadTs('src/lib/face-reference-guidance.ts');
const { buildFinalPrompt } = loadTs('src/lib/final-prompt.ts');
const { MODEL_POSE_OPTIONS } = loadTs('src/lib/model-shot.ts');
const references = Array.from({ length: 4 }, (_, i) => ({ id: `ref-${i}`, name: `${i}.png`, url: `https://example.com/ref-${i}.png` }));
const profile = { id: 'bob', name: 'Bob', kind: 'human', wearerType: 'mens', prompt: 'Short blond hair', styling: 'Dark navy pants and white sneakers', faceReferences: references };
const preset = { id: 'preset', name: 'Top', shotMode: 'model', polishedPrompt: 'Studio catalog product photo.' };
const config = { presetId: 'preset', notes: '', modelWearerType: 'mens', modelPoseType: 'full_body', modelProfileId: 'bob', backgroundMode: 'global' };

function setup({ pose = 'full_body', view = 'front', mode = 'model', missing = [], count = 4, omitView = false } = {}) {
  const readUrls = [];
  let request;
  const route = loadTs('src/app/api/touch-up/route.ts', {
    '@/lib/openai': { getOpenAIClient: () => ({ images: { edit: async (params) => {
      request = params;
      return { data: [{ b64_json: 'aW1hZ2U=' }] };
    } } }) },
    '@/lib/file-utils': { saveFile: async () => 'https://example.com/result.png' },
    '@/lib/image-history': {
      getImageHistoryItem: async () => ({ usedSettings: { shotMode: mode, modelProfileId: profile.id, modelPoseType: pose, viewType: view } }),
      completeImageHistoryItem: async () => {},
    },
    '@/lib/server-store': { getModelProfiles: async () => [{ ...profile, faceReferences: references.slice(0, count) }] },
    '@/lib/blob-utils': {
      readBlob: async (url) => {
        readUrls.push(url);
        if (missing.includes(url)) throw new Error('Unreadable');
        return { buffer: Buffer.from(url), contentType: 'image/png' };
      },
      blobServingUrl: (url) => url,
    },
  });
  return {
    run: () => route.POST(new Request('http://local/api/touch-up', { method: 'POST', body: JSON.stringify({ sourceUrl: 'https://example.com/source.png', folder: 'test', photoId: 'photo', prompt: 'Preserve the product.', modelProfileId: profile.id, modelPoseType: pose, shotMode: mode, viewType: omitView ? undefined : view }) })),
    inspect: () => ({ request, readUrls }),
  };
}

test('front and back receive the identical complete ordered reference set', async () => {
  const submitted = [];
  for (const view of ['front', 'back']) {
    const api = setup({ view });
    assert.equal((await api.run()).status, 200);
    const { request } = api.inspect();
    assert.equal(request.model, 'gpt-image-2');
    assert.equal(request.image.length, 5);
    submitted.push(await Promise.all(request.image.slice(1).map((file) => file.text())));
    assert.match(request.prompt, /consistent hairstyle reference/);
    assert.match(request.prompt, /Pants, shoes, and accessories/);
    assert.equal(request.prompt.includes('Expression variation:'), view === 'front');
  }
  assert.deepEqual(submitted[0], references.map((r) => r.url));
  assert.deepEqual(submitted[0], submitted[1]);
});

test('every expression reference can be selected without changing identity or hairstyle instructions', () => {
  for (let i = 0; i < 4; i++) {
    const prompt = faceReferenceGuidance(4, 'front', () => (i + 0.1) / 4);
    assert.ok(prompt.includes(`use Image ${i + 2} only as a cue`));
    assert.match(prompt, /complete reference set collectively/);
    assert.match(prompt, /use Image 2 as the consistent hairstyle reference/);
    assert.match(prompt, /explicit expression requests.*take priority/);
  }
});

test('back and detail keep references without forcing an expression or changing framing', async () => {
  for (const view of ['back', 'detail']) {
    const api = setup({ view, omitView: true });
    assert.equal((await api.run()).status, 200);
    assert.equal(api.inspect().request.image.length, 5);
    assert.doesNotMatch(api.inspect().request.prompt, /Expression variation:|takes precedence over|crop tightly/);
  }
});

test('side and unknown expressions remain conditional on the existing view', () => {
  assert.match(faceReferenceGuidance(4, 'side'), /requested side profile/);
  assert.match(faceReferenceGuidance(4, 'unknown'), /rear or detail view, omit expression variation/);
});

test('single-reference profiles allow slight expressions without fabricated image indexes', () => {
  const prompts = [0, 0.4, 0.9].map((random) => faceReferenceGuidance(1, 'front', () => random));
  assert.equal(new Set(prompts).size, 3);
  for (const prompt of prompts) assert.doesNotMatch(prompt, /Image [3-9]/);
  assert.equal(faceReferenceGuidance(0, 'front'), '');
});

test('all baseline framing prompts and styling survive front/back prompt construction', () => {
  for (const pose of MODEL_POSE_OPTIONS) {
    for (const view of ['front', 'back']) {
      const prompt = buildFinalPrompt(preset, { ...config, modelPoseType: pose.value }, { viewType: view, allProfiles: [profile] });
      assert.ok(prompt.includes(pose.prompt));
      assert.ok(prompt.includes(profile.styling));
      assert.ok(prompt.includes(MODEL_CONTINUITY_GUIDANCE));
      assert.doesNotMatch(prompt, /Do not copy expression/);
    }
  }
});

test('no-face crops and non-model modes keep source-only image requests', async () => {
  for (const options of [{ pose: 'upper_no_face' }, { pose: 'lower_no_face' }, { mode: 'product' }, { mode: 'touchup' }]) {
    const api = setup(options);
    assert.equal((await api.run()).status, 200);
    assert.ok(api.inspect().request.image instanceof File);
    assert.doesNotMatch(api.inspect().request.prompt, /Expression variation:/);
  }
});

test('unreadable references block generation instead of silently changing the identity set', async () => {
  const api = setup({ missing: [references[2].url] });
  assert.equal((await api.run()).status, 400);
  assert.equal(api.inspect().request, undefined);
});
