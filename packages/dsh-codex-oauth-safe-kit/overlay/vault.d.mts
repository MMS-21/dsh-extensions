export function loadVaultKey(): Buffer;
export function seal(document: unknown, key: Buffer): string;
export function unseal(text: string, key: Buffer): unknown;
