import * as fs from 'fs';
import { Worker } from 'worker_threads';

/** ISO-BMFF brands used by HEIC/HEIF stills (bytes 8–11 after "ftyp"). */
const HEIC_BRANDS = new Set([
  'heic',
  'heix',
  'heim',
  'heis',
  'hevc',
  'hevx',
  'mif1',
  'msf1',
]);

/** True when the file starts like a HEIC/HEIF image, whatever its name. */
export function looksLikeHeic(head: Buffer): boolean {
  return (
    head.length >= 12 &&
    head.toString('latin1', 4, 8) === 'ftyp' &&
    HEIC_BRANDS.has(head.toString('latin1', 8, 12))
  );
}

export function readHead(file: string, bytes = 12): Buffer {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const n = fs.readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

let modulePath: string | null | undefined;

/**
 * heic-convert is pure JS (libheif compiled to JS), so it works on any
 * server without native libraries. Sharp's prebuilt binaries cannot decode
 * HEIC (no HEVC), hence this package. Null if it is not installed.
 */
export function heicConverterPath(): string | null {
  if (modulePath === undefined) {
    try {
      modulePath = require.resolve('heic-convert');
    } catch {
      modulePath = null;
    }
  }
  return modulePath;
}

// Decoding a 12 MP photo takes ~0.5–3 s of CPU, so it runs in a worker
// thread (the event loop stays free) and at most two at a time.
const WORKER_SOURCE = `
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const convert = require(workerData.modulePath);
convert({ buffer: fs.readFileSync(workerData.input), format: 'JPEG', quality: workerData.quality })
  .then((out) => {
    fs.writeFileSync(workerData.output, Buffer.from(out));
    parentPort.postMessage({ ok: true });
  })
  .catch((e) => parentPort.postMessage({ ok: false, error: String((e && e.message) || e) }));
`;

const MAX_CONCURRENT = 2;
let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

/** Writes a JPEG of `input` to `output`. Rejects if it can't be decoded. */
export function convertHeicFileToJpeg(
  input: string,
  output: string,
  { quality = 0.9, timeoutMs = 60_000 } = {},
): Promise<void> {
  const converter = heicConverterPath();
  if (!converter) {
    return Promise.reject(new Error('HEIC conversion is not available'));
  }
  return withSlot(
    () =>
      new Promise<void>((resolve, reject) => {
        const worker = new Worker(WORKER_SOURCE, {
          eval: true,
          workerData: { modulePath: converter, input, output, quality },
        });
        const timer = setTimeout(() => {
          worker.terminate();
          reject(new Error('HEIC conversion timed out'));
        }, timeoutMs);
        worker.once('message', (msg: { ok: boolean; error?: string }) => {
          clearTimeout(timer);
          worker.terminate();
          if (msg.ok) resolve();
          else reject(new Error(msg.error || 'HEIC conversion failed'));
        });
        worker.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
      }),
  );
}
