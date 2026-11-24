import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { credentialKey } from '@deepseek-ai/dsh-credentials';
import { createQuotaService } from './quota-service.mjs';
// Read only the native grant. Never enumerate, create, refresh or write credentials.
export default class CodexQuota extends TypertRemoteService {
  static inject = ['credentials'];
  constructor(ctx) {
    super(ctx, 'safeCodexQuota');
    this.quota = createQuotaService(() => ctx.credentials.readRecord(credentialKey('llm-pi-ai', 'openai-codex')));
  }
  async query() { return this.quota.query(); }
}
