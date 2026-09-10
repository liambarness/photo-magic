// Manual, paid visual comparison. Requires explicit source IDs and writes only local files.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import nextEnv from '@next/env';
import { get } from '@vercel/blob';
import OpenAI from 'openai';
import { loadTs } from './load-ts.mjs';

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const [phase, frontId, backId, outputDir] = process.argv.slice(2);
if (!['prepare', 'generate'].includes(phase) || !frontId || !backId || !outputDir) {
  throw new Error('Usage: node tests/visual-face-check.mjs prepare|generate FRONT_ID BACK_ID OUTPUT_DIR');
}
const directory = resolve(outputDir);
await mkdir(directory, { recursive: true });
async function readBlob(url) {
  const blob = await get(url, { access: 'private', useCache: false });
  if (!blob) throw new Error('Missing test input');
  return { buffer: Buffer.from(await new Response(blob.stream).arrayBuffer()), contentType: blob.blob.contentType };
}
async function readJson(path) { return JSON.parse((await readBlob(path)).buffer.toString()); }

if (phase === 'prepare') {
  const [profiles, history, settings] = await Promise.all([
    readJson('data/model-profiles.json'), readJson('data/image-history.json'), readJson('data/settings.json'),
  ]);
  const items = [frontId, backId].map(id => history.items.find(item => item.id === id));
  if (items.some(item => !item)) throw new Error('Test photos not found');
  if (items[0].usedSettings.modelProfileId !== items[1].usedSettings.modelProfileId) throw new Error('Test pair must share a profile');
  const profile = profiles.find(p => p.id === items[0].usedSettings.modelProfileId);
  if (!profile?.faceReferences?.length) throw new Error('Profile has no references');
  const assets = [];
  for (const [index, item] of items.entries()) assets.push({ url: item.sourceUrl, name: `source-${index === 0 ? 'front' : 'back'}.png` });
  for (const [index, reference] of profile.faceReferences.slice(0, 4).entries()) assets.push({ url: reference.url, name: `reference-${index + 1}.png` });
  for (const asset of assets) {
    const blob = await readBlob(asset.url);
    await writeFile(join(directory, asset.name), blob.buffer);
    asset.contentType = blob.contentType;
  }
  await writeFile(join(directory, 'fixture.json'), JSON.stringify({ items, profile, settings, assets }, null, 2));
  console.log(JSON.stringify({ prepared: directory, references: profile.faceReferences.length, model: profile.name, quality: settings.imageQuality, size: settings.imageSize }));
} else {
  const fixture = JSON.parse(await readFile(join(directory, 'fixture.json'), 'utf8'));
  const baselinePath = join(directory, 'baseline-route.ts');
  await writeFile(baselinePath, execFileSync('git', ['show', 'c9b7d82fee08e2f9243c7a6c18da96c33afefdbe:src/app/api/touch-up/route.ts']));
  const client = new OpenAI({ maxRetries: 0, timeout: 300000 });
  const results = [];
  for (const version of ['baseline', 'candidate']) {
    for (const [index, item] of fixture.items.entries()) {
      const name = `${version}-${index === 0 ? 'front' : 'back'}`;
      const route = loadTs(version === 'baseline' ? baselinePath : 'src/app/api/touch-up/route.ts', {
        '@/lib/openai': { getOpenAIClient: () => ({ images: { edit: async params => {
          await writeFile(join(directory, `${name}-prompt.txt`), params.prompt);
          return client.images.edit(params);
        } } }) },
        '@/lib/server-store': { getModelProfiles: async () => [fixture.profile] },
        '@/lib/image-history': { getImageHistoryItem: async () => item, completeImageHistoryItem: async () => {} },
        '@/lib/blob-utils': {
          readBlob: async url => {
            const asset = fixture.assets.find(a => a.url === url);
            if (!asset) throw new Error('Unknown test asset');
            return { buffer: await readFile(join(directory, asset.name)), contentType: asset.contentType };
          },
          blobServingUrl: url => url,
        },
        '@/lib/file-utils': { saveFile: async (_folder, filename, buffer) => {
          const ext = filename.split('.').pop();
          const path = join(directory, `${name}.${ext}`);
          await writeFile(path, buffer);
          return path;
        } },
      });
      console.log(`Generating ${name}`);
      const started = Date.now();
      const response = await route.POST(new Request('http://local/api/touch-up', { method: 'POST', body: JSON.stringify({
        photoId: item.id, sourceUrl: item.sourceUrl, folder: 'visual-test', prompt: item.usedSettings.finalPrompt,
        modelProfileId: fixture.profile.id, modelPoseType: item.usedSettings.modelPoseType,
        viewType: item.usedSettings.viewType, shotMode: 'model',
        imageSize: fixture.settings.imageSize, imageQuality: fixture.settings.imageQuality, outputFormat: 'png',
      }) }));
      const result = await response.json();
      if (!response.ok) throw new Error(`${name}: ${JSON.stringify(result)}`);
      results.push({ name, seconds: (Date.now() - started) / 1000, ...result });
      await writeFile(join(directory, 'results.json'), JSON.stringify(results, null, 2));
      console.log(JSON.stringify(results.at(-1)));
    }
  }
}
