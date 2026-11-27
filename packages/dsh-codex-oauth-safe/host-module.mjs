import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';

export async function hostModule(name) {
  try { return await import(name); }
  catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND' || !process.versions.electron || !process.resourcesPath) throw error;
    const nativeRequire = createRequire(join(process.resourcesPath, 'app.asar', 'dsh', 'package.json'));
    return import(pathToFileURL(nativeRequire.resolve(name)).href);
  }
}
