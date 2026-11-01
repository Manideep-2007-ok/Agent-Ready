// Picks the real engine and SSE hub when they exist, and the dev stand-ins when they do not.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as devEngine from './devEngine.js';
import * as devEvents from './devEvents.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Imports `specifier` only if its entry file exists; real errors inside an existing module still surface. */
async function tryImport(specifier, file) {
  try {
    await fs.access(file);
  } catch {
    return null;
  }
  return import(specifier);
}

/** Real engine functions win; anything the engine does not export yet comes from the dev stand-in. */
export async function loadEngine() {
  const real = await tryImport('@agentready/engine', path.join(here, '../../../packages/engine/src/index.js'));
  const merged = { ...devEngine, ...(real ?? {}) };
  const stubbed = Object.keys(devEngine).filter((name) => !real || !(name in real));
  return { engine: merged, stubbed };
}

export async function loadEvents() {
  const real = await tryImport('./events.js', path.join(here, 'events.js'));
  return real?.subscribe && real?.publish ? { events: real, stubbed: false } : { events: devEvents, stubbed: true };
}
