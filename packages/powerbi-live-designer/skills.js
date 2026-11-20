import {readFileSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

/** Register bundled skills with native resource paths; no prompt-body injection. */
export function registerDesignSkills(registry) {
  const root = new URL('./skills/', import.meta.url);
  const dispose = [];
  try {
    for (const name of readdirSync(root)) {
      const file = new URL(`${name}/SKILL.md`, root);
      const text = readFileSync(file, 'utf8');
      const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
      if (!match) throw new Error(`Invalid bundled skill: ${name}`);
      const field = key => new RegExp(`^${key}: (.+)$`, 'm').exec(match[1])?.[1].trim();
      if (field('name') !== name || !field('description')) throw new Error(`Invalid skill metadata: ${name}`);
      dispose.push(registry.register({name, description: field('description'), content: match[2],
        path: fileURLToPath(file), source: 'bundled',
        resourceBase: {kind: 'directory', path: fileURLToPath(new URL(`${name}/`, root))}}));
    }
  } catch (error) {
    dispose.reverse().forEach(fn => fn());
    throw error;
  }
  return () => dispose.reverse().forEach(fn => fn());
}
