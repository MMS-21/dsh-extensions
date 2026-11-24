#!/usr/bin/env node
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { login, logout, status } from './auth.js'
import { FileCredentialStore } from './store.js'
import { loadVaultKey } from '../vault.mjs'
async function main(): Promise<void> {
  const [verb, ...flags] = process.argv.slice(2)
  if (!['login','logout','status'].includes(verb ?? '') || flags.some(f => f !== '--device' && f !== '--no-open') || (verb !== 'login' && flags.length)) {
    console.error('Usage: dsh-codex-oauth-safe login [--device] [--no-open] | logout | status')
    process.exitCode=2;return
  }
  const key=loadVaultKey();key.fill(0)
  const store=new FileCredentialStore(dshHomePath('codex-oauth-safe.json'))
  if(verb==='login') await login({store,method:flags.includes('--device')?'device':'browser',openBrowser:!flags.includes('--no-open'),reporter:{line: text=>console.log(text)}})
  else if(verb==='logout'){await logout(store);console.log('Local credentials removed. This does not revoke remote sessions.')}
  else for(const line of await status(store))console.log(line)
}
main().catch(()=>{console.error('Codex operation failed. Check vault key, login and network.');process.exitCode=1})
