import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

export function readManifest(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function inspectCompatibility(runtime, profile) {
  const runtimeManifest = path.join(runtime, 'package.json');
  readManifest(runtimeManifest);
  const runtimeRequire = createRequire(runtimeManifest);
  const manifest = readManifest(path.join(profile, 'package.json'));
  return Object.entries(manifest.dependencies ?? {})
    .filter(([name]) => name.startsWith('@local/') && !name.includes('taskboard'))
    .map(([name, reference]) => {
      try {
        const target = /^(link|file):/.test(reference)
          ? path.resolve(profile, reference.slice(reference.indexOf(':') + 1))
          : path.join(profile, 'node_modules', name);
        const pkg = readManifest(path.join(target, 'package.json'));
        const peers = Object.entries(pkg.peerDependencies ?? {})
          .filter(([peer]) => peer.startsWith('@deepseek-ai/'))
          .map(([peer, declared]) => {
            try {
              const actual = readManifest(path.join(runtime, 'node_modules', peer, 'package.json')).version;
              const status = declared === actual ? 'match'
                : /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(declared) ? 'mismatch' : 'range-review-needed';
              return {name:peer, declared, actual, status};
            } catch {
              return {name:peer, declared, status:'runtime-package-unavailable'};
            }
          });
        const missingClientPackages = (pkg.dsh?.client?.inject ?? []).filter(peer => {
          try { runtimeRequire.resolve(peer); return false; } catch { return true; }
        });
        return {name, version:pkg.version, peers, missingClientPackages, certified:false};
      } catch (error) {
        return {name, error:error.code ?? 'inspection-failed', certified:false};
      }
    });
}
