import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import { createHash } from 'node:crypto';
import { FileCredentialStore } from './lib/store.js';
import { emptyQuota, readQuota } from './quota-core.mjs';
export default class CodexQuota extends TypertRemoteService {
  constructor(ctx) {
    super(ctx, 'safeCodexQuota');
    this.store = new FileCredentialStore(dshHomePath('codex-oauth-safe.json'));
    this.cache = null;
    this.pending = null;
  }
  async query() {
    let credential;
    try {credential=await this.store.read('openai-codex');} catch {return emptyQuota('vault-locked');}
    if (credential?.type !== 'oauth' || typeof credential.access !== 'string') {this.cache=null; return emptyQuota('signed-out');}
    if (credential.expires <= Date.now()) {this.cache=null; return emptyQuota('expired');}
    const key=createHash('sha256').update(credential.access).digest('hex');
    if(this.cache?.key===key && Date.now()-this.cache.value.fetchedAt<60000)return this.cache.value;
    if(this.pending?.key===key)return this.pending.promise;
    const pending={key,promise:null};
    pending.promise=readQuota(credential).then(value=>{if(this.pending===pending)this.cache={key,value};return value;}).finally(()=>{if(this.pending===pending)this.pending=null;});
    this.pending=pending;
    return pending.promise;
  }
}
