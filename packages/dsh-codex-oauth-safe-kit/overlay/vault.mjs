import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { openSync, closeSync, readFileSync, fstatSync, constants } from 'node:fs';
const AAD = Buffer.from('dsh-codex-oauth-safe:v1');
export function loadVaultKey() {
  const path = process.env.DSH_CODEX_VAULT_KEY_FILE;
  if (!path) throw new Error('Set DSH_CODEX_VAULT_KEY_FILE to a private 32-byte key file.');
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const info = fstatSync(fd);
    if (!info.isFile() || info.size !== 32 || (process.platform !== 'win32' && (info.mode & 0o077))) throw new Error('invalid key file');
    if (process.getuid && info.uid !== process.getuid()) throw new Error('wrong key owner');
    const key = readFileSync(fd);
    if (key.length !== 32) throw new Error('invalid key length');
    return key;
  } catch { throw new Error('Vault key unavailable or unsafe. Use a private 32-byte key file (0600 on POSIX).'); }
  finally { if (fd !== undefined) closeSync(fd); }
}
export function seal(document, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const data = Buffer.concat([cipher.update(JSON.stringify(document), 'utf8'), cipher.final()]);
  return JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') }) + '\n';
}
export function unseal(text, key) {
  try {
    const value = JSON.parse(text);
    if (value.version !== 1 || !['iv','tag','data'].every(k => typeof value[k] === 'string')) throw new Error();
    const iv = Buffer.from(value.iv, 'base64'), tag = Buffer.from(value.tag, 'base64');
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    decipher.setAAD(AAD); decipher.setAuthTag(tag);
    const parsed = JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data,'base64')), decipher.final()]).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch { throw new Error('Vault authentication failed. Check your key; plaintext credentials are not accepted.'); }
}
