import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
// Isolated TypeScript loader: tests can replace paid APIs and persistence without network calls.
export function loadTs(entry, mocks = {}, cache = new Map()) {
  const filename = resolve(entry);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loadedModule = { exports: {} };
  cache.set(filename, loadedModule);
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = (id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id.startsWith('@/') || id.startsWith('.')) {
      let path = id.startsWith('@/') ? resolve('src', id.slice(2)) : resolve(dirname(filename), id);
      if (!existsSync(path)) path += '.ts';
      return loadTs(path, mocks, cache);
    }
    return require(id);
  };
  new Function('require', 'module', 'exports', compiled)(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
