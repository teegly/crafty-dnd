import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEV_PREVIEW_URL_PARAMS,
  USER_PREVIEW_URL_PARAMS,
  filterUrlParams,
  isLocalPreviewHost,
} from '../src/urlParams.js';

const expectedUserParams = ['distance', 'quality', 'paused'];
const expectedDevParams = ['fov', 'portal'];
const sampleSearch = '?distance=1800&quality=low&paused=1&fov=55&portal=1&outfit=gown';

assertSameMembers(USER_PREVIEW_URL_PARAMS, expectedUserParams, 'user preview params');
assertSameMembers(DEV_PREVIEW_URL_PARAMS, expectedDevParams, 'dev preview params');

assertEqual(isLocalPreviewHost('localhost'), true, 'localhost allows preview params');
assertEqual(isLocalPreviewHost('127.0.0.1'), true, '127.0.0.1 allows preview params');
assertEqual(isLocalPreviewHost('crafty-dnd.example'), false, 'live host rejects preview params');

const userParams = filterUrlParams(sampleSearch, USER_PREVIEW_URL_PARAMS);
const devParams = filterUrlParams(sampleSearch, DEV_PREVIEW_URL_PARAMS);

assertEqual(userParams.get('distance'), '1800', 'distance remains user-accessible');
assertEqual(userParams.get('quality'), 'low', 'quality remains user-accessible');
assertEqual(userParams.get('paused'), '1', 'paused remains user-accessible');
assertEqual(userParams.has('fov'), false, 'fov is not user-accessible');
assertEqual(userParams.has('portal'), false, 'portal is not user-accessible');

assertEqual(devParams.get('fov'), '55', 'fov remains dev-gated');
assertEqual(devParams.get('portal'), '1', 'portal remains dev-gated');
assertEqual(devParams.has('distance'), false, 'distance is not dev-only');
assertEqual(devParams.has('quality'), false, 'quality is not dev-only');
assertEqual(devParams.has('paused'), false, 'paused is not dev-only');

verifyAmbientRunnerInput();

console.log('URL-param contract verified');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertSameMembers(actual, expected, message) {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  assertEqual(JSON.stringify(actualSorted), JSON.stringify(expectedSorted), message);
}

function verifyAmbientRunnerInput() {
  const runnerDir = join(process.cwd(), 'src', 'runner');
  const files = listJsFiles(runnerDir);
  const allowedListeners = new Set(['resize', 'visibilitychange']);
  const blockedInputPattern = /\b(keydown|keyup|keypress|pointerdown|pointerup|pointermove|mousedown|mouseup|mousemove|touchstart|touchend|touchmove|wheel|click)\b/;

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const listenerPattern = /addEventListener\(\s*['"]([^'"]+)['"]/g;
    for (const match of source.matchAll(listenerPattern)) {
      const eventName = match[1];
      if (!allowedListeners.has(eventName)) {
        throw new Error(`runner core must stay passive: ${file} listens for ${eventName}`);
      }
    }
    const inputMatch = source.match(blockedInputPattern);
    if (inputMatch) {
      throw new Error(`runner core must stay passive: ${file} references ${inputMatch[1]}`);
    }
  }
}

function listJsFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      files.push(...listJsFiles(path));
    } else if (path.endsWith('.js')) {
      files.push(path);
    }
  }
  return files;
}
