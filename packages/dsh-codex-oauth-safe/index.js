import {installCodexCompatibility} from './codex-compat.mjs';
import {hostModule} from './host-module.mjs';
import {registerChatGptCommand} from './chatgpt-command.mjs';
const {TypertRemoteService} = await hostModule('@deepseek-ai/dsh-typert-protocol');
const {credentialKey} = await hostModule('@deepseek-ai/dsh-credentials');
import { createQuotaService } from './quota-service.mjs';
// Read only the native grant. Never enumerate, create, refresh or write credentials.
export default class CodexQuota extends TypertRemoteService {
  static inject = ['credentials'];
  constructor(ctx) {
    super(ctx, 'safeCodexQuota');
    ctx.inject(['llm'], scoped => scoped.effect(() => installCodexCompatibility(scoped.llm)));
    ctx.inject(['commands','authorization'], scoped => scoped.effect(() => registerChatGptCommand(scoped, credentialKey('llm-pi-ai','openai-codex'))));
    this.quota = createQuotaService(() => ctx.credentials.readRecord(credentialKey('llm-pi-ai', 'openai-codex')));
  }
  async query() { return this.quota.query(); }
}
