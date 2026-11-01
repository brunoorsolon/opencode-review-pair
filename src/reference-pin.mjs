import { readFileSync, lstatSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
export const REFERENCE_COMMIT = '2de9cc3758b9fc593f5afca4fc501fd013d416ec';
const HASHES = Object.freeze({
  "reference/inbox.mjs": "fbf0fa6096996cb9bc3f928e55f3eca496420880a03460e993dda3417b32ad88",
  "reference/client.mjs": "c4c313e937d1003f28928a672072b926022aa0e9fd65825bc5db1078eb90afa9",
  "reference/runtime.mjs": "8733076b73a42ab8f12fe20ba9908acdd754d89734ffd335e84b49aee9d737ca",
  "reference/tools.mjs": "5d3b16212a048912395d74b95a8b590d278b8b0915bb0bd7a0c3d80daf353839",
  "reference/mcp-stdio.mjs": "f34b0cdcda9c2d607815e4ef99f1ba80fbd8936ef8c2893a858b6d408bc0ff09",
  "reference/errors.mjs": "e33231d94f514b5a1b59fdd4184f5881dd3712bde725a1cf53352c26293452ac",
  "src/protocol.mjs": "2d88829971643d47430d6696d0a6ac61589ea4f9001c860c5c196ecc5ac21a6f"
});
/** Verify reviewed source bytes before importing any trusted local module. */
export function verifyReference(directory) {
  if (typeof directory !== 'string' || !isAbsolute(directory)) throw new Error('absolute_reference_required');
  for (const [file, digest] of Object.entries(HASHES)) {
    const path = join(directory, file), stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024 || createHash('sha256').update(readFileSync(path)).digest('hex') !== digest) throw new Error('reference_snapshot_mismatch');
  }
}
