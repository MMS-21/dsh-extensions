#!/usr/bin/env python3
"""Apply the reviewed overlay to a clean, exact upstream Git checkout. No network or package scripts are run."""
import argparse, json, pathlib, shutil, subprocess, tempfile, tarfile
ROOT=pathlib.Path(__file__).resolve().parent
PIN='362738416bccddcb7a882ccf4c98f2ac2959e61f'
NAME='dsh-codex-oauth-safe'
def replace(text, old, new):
    if text.count(old)!=1: raise ValueError('Upstream pattern differs: '+old[:90])
    return text.replace(old,new,1)
def patch(path, changes):
    text=path.read_text(encoding='utf-8')
    for old,new in changes: text=replace(text,old,new)
    path.write_text(text,encoding='utf-8')
def build(src, dest):
    src=src.resolve(); dest=dest.resolve()
    if dest.exists(): raise ValueError('Destination must not exist.')
    if subprocess.check_output(['git','-C',str(src),'rev-parse','HEAD'],text=True).strip()!=PIN:
        raise ValueError('Checkout does not match pinned commit '+PIN)
    # Extract tracked Git object bytes, not locally modified files or node_modules.
    with tempfile.TemporaryDirectory(dir=dest.parent) as tmp:
        temp=pathlib.Path(tmp); archive=temp/'upstream.tar'; work=temp/'source';work.mkdir()
        subprocess.run(['git','-C',str(src),'archive','--format=tar','-o',str(archive),PIN],check=True)
        with tarfile.open(archive) as t:t.extractall(work,filter='data')
        # Never ship unverified checked-in build artifacts or the privilege-changing installer.
        shutil.rmtree(work/'lib')
        for f in ['src/install.ts','tests/install.spec.ts','tests/bin.spec.ts','pnpm-workspace.yaml','README.zh.md','CONTRIBUTING.md']:(work/f).unlink(missing_ok=True)
        s=work/'src'
        patch(s/'store.ts',[
          ("import { readFile, stat, mkdir } from 'node:fs/promises'", "import { readFile, lstat, mkdir } from 'node:fs/promises'\nimport { loadVaultKey, seal, unseal } from '../vault.mjs'"),
          ("      text = await readFile(this.path, 'utf8')", "      const info = await lstat(this.path)\n      if (!info.isFile() || info.isSymbolicLink() || info.size > 1_048_576) throw new Error('Unsafe credential vault file')\n      if (process.platform !== 'win32' && ((info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid()))) throw new Error('Unsafe credential vault permissions')\n      text = await readFile(this.path, 'utf8')"),
          ("    if (process.platform !== 'win32') {\n      const mode = (await stat(this.path)).mode\n      if ((mode & 0o077) !== 0) {\n        throw new Error(\n          `dsh-codex-oauth: credential store ${this.path} is readable by other users;`\n          + ' run `chmod 600` on it (it holds your Codex OAuth tokens)',\n        )\n      }\n    }\n    const parsed: unknown = JSON.parse(text)", "    const key = loadVaultKey()\n    let parsed: unknown\n    try { parsed = unseal(text, key) } finally { key.fill(0) }"),
          ("    await writeFileAtomic(this.path, `${JSON.stringify(document, null, 2)}\\n`, {\n      mode: FILE_MODE,\n      dirMode: DIR_MODE,\n    })", "    const key = loadVaultKey()\n    try { await writeFileAtomic(this.path, seal(document, key), { mode: FILE_MODE, dirMode: DIR_MODE }) }\n    finally { key.fill(0) }"),
        ])
        # Check vault configuration before OAuth begins. Restrict every displayed login URL.
        patch(s/'auth.ts',[
          ("import { spawn } from 'node:child_process'", "import { spawn } from 'node:child_process'\nimport { loadVaultKey } from '../vault.mjs'\n\nfunction trustedLoginUrl(value: string): boolean {\n  try { const url = new URL(value); return url.protocol === 'https:' && ['auth.openai.com', 'chatgpt.com'].includes(url.hostname) && !url.username && !url.password && !url.port } catch { return false }\n}"),
          ("  const detail = error instanceof Error ? error.message : String(error)\n  reporter?.line(`dsh-codex-oauth: could not open the browser automatically: ${detail}`)", "  void error\n  reporter?.line('Could not open the browser automatically; use the trusted authorization URL.')"),
          ("if (!url.startsWith('https://'))", "if (!trustedLoginUrl(url))"),
          ("? 'cmd'", "? 'rundll32.exe'"),
          ("['/c', 'start', '', url]", "['url.dll,FileProtocolHandler', url]"),
          ("      reporter.line(event.message)\n      for (const link of event.links ?? []) reporter.line(`${link.label ?? 'More information'}: ${link.url}`)", "      reporter.line('Follow the OpenAI login instructions.')\n      for (const link of event.links ?? []) if (trustedLoginUrl(link.url)) reporter.line(`OpenAI: ${link.url}`)"),
          ("      if (openBrowser) openUrlInBrowser(event.url, reporter)", "      if (!trustedLoginUrl(event.url)) throw new Error('Untrusted authorization URL')\n      if (openBrowser) openUrlInBrowser(event.url, reporter)"),
          ("      reporter.line(`Open ${event.verificationUri}", "      if (!trustedLoginUrl(event.verificationUri)) throw new Error('Untrusted verification URL')\n      reporter.line(`Open ${event.verificationUri}"),
          ("    case 'progress':\n      reporter.line(event.message)", "    case 'progress':\n      reporter.line('Waiting for OpenAI authorization…')"),
          ("  const { store, method, openBrowser, signal, reporter } = options", "  const { store, method, openBrowser, signal, reporter } = options\n  const key = loadVaultKey(); key.fill(0)\n  await store.read(CODEX_PROVIDER_ID)"),
          ("  const account = credential.accountId === undefined ? '' : ` (account ${String(credential.accountId)})`\n  return [`Codex logged in${account}; access token expires ${expires}. pi-ai refreshes it automatically.`]", "  return [`Codex logged in; access token expires ${expires}. pi-ai refreshes it automatically.`]"),
        ])
        patch(s/'command.ts',[
          ('run `dsh-codex-oauth login --method device`.', 'run `dsh-codex-oauth-safe login --device`.'),
          ("text: 'Codex logged out.'", "text: 'Local Codex credentials removed. Remote sessions are not revoked.'"),
          ("        const detail = error instanceof Error ? error.message : String(error)\n        return { kind: 'error', text: `Codex ${verb ?? 'login'} failed: ${detail}` }", "        void error\n        return { kind: 'error', text: 'Codex operation failed. Check the vault key, login and network.' }"),
        ])
        patch(s/'index.ts',[
          ('  storePath?: string\n',''),
          ('  storePath: Schema.string(),\n',''),
          ("config.storePath ?? dshHomePath('codex-oauth.json')", "dshHomePath('codex-oauth-safe.json')"),
          ("export const name = 'dsh-codex-oauth'", "export const name = 'dsh-codex-oauth-safe'"),
          ("cacheRetention: Schema.union(['none', 'short', 'long']).default('long')", "cacheRetention: Schema.union(['none', 'short', 'long']).default('none')"),
        ])
        # The original adapter and conversion pipeline remain unchanged (native usage chunks retained).
        shutil.copy2(ROOT/'overlay'/'bin.ts',s/'bin.ts')
        for f in (ROOT/'overlay').iterdir():
            if f.name!='bin.ts':shutil.copy2(f,work/f.name)
        pkg=json.loads((work/'package.json').read_text()); lock=json.loads((work/'package-lock.json').read_text()); lp=lock['packages']; entry=lp['']
        pkg['name']=NAME;pkg['version']='0.1.0';pkg['description']='Hardened community Codex provider with encrypted vault and DSH quota chip';pkg.pop('repository',None)
        pkg['bin']={NAME:'lib/bin.js'};pkg['files']=['lib','src','vault.mjs','vault.d.mts','quota-core.mjs','quota-host.js','typert.host.js','client.js','cordis.patch.yml','README.md','LICENSE','UPSTREAM.md']
        pkg['exports'].update({'./client':'./client.js','./typert':'./typert.host.js','./quota-host':'./quota-host.js'})
        pkg['dsh']['client']={'inject':['@deepseek-ai/dsh-api-remotes','@deepseek-ai/dsh-client-ui-conversation','@deepseek-ai/dsh-client-ui-model-selection'],'platform':'web'}
        pkg['scripts'].pop('prepack',None);pkg['scripts'].pop('test',None);pkg['scripts']['test:security']='node --test security-tests/*.test.mjs'
        pkg['dependencies']['zod']='4.4.3';pkg['peerDependencies']['@deepseek-ai/dsh-typert-protocol']='^0.1.0-rc.7';pkg['peerDependencies']['react']='^18.2.0';pkg['peerDependenciesMeta']['react']={'optional':True}
        for group in ['dependencies','devDependencies','peerDependencies']:
            for name in pkg[group]:
                if group!='peerDependencies':pkg[group][name]=lp['node_modules/'+name]['version']
            entry[group]=pkg[group]
        # zod is now a production dependency; preserve integrity and transitive versions.
        lp['node_modules/zod'].pop('dev',None);lp['node_modules/zod'].pop('devOptional',None);lp['node_modules/zod'].pop('peer',None)
        entry['peerDependenciesMeta']=pkg['peerDependenciesMeta'];entry['bin']=pkg['bin'];entry['name']=NAME;entry['version']=pkg['version'];lock['name']=NAME;lock['version']=pkg['version']
        (work/'package.json').write_text(json.dumps(pkg,indent=2)+'\n');(work/'package-lock.json').write_text(json.dumps(lock,indent=2)+'\n')
        # Old tests target the plaintext vault and old installer. Preserve for reference outside active test discovery.
        if (work/'tests').exists():(work/'tests').rename(work/'upstream-tests-reference')
        shutil.copytree(ROOT/'tests',work/'security-tests')
        shutil.copy2(ROOT/'README.md',work/'README.md')
        (work/'UPSTREAM.md').write_text('Based on MIT-licensed https://github.com/birat-chapagain/dsh-codex-oauth at '+PIN+'\nOriginal LICENSE retained. DSH slot and Typert integration informed by MIT-licensed https://github.com/Carrick-K7/dsh-ai-quota.\n')
        shutil.move(str(work),str(dest))
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('upstream',type=pathlib.Path);p.add_argument('destination',type=pathlib.Path);a=p.parse_args()
    build(a.upstream,a.destination);print('Assembled source in',a.destination,'; inspect changes before building.')
