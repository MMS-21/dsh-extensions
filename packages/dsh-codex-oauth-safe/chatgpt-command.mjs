export function registerChatGptCommand(ctx, key) {
  let state = 'Signed out';
  let notice = '';
  let running = false;
  let failed = false;
  return ctx.commands.register({
    name: 'chatgpt',
    description: 'Sign into your ChatGPT Codex subscription. Use login, status or cancel.',
    input: {hint: 'login | status | cancel'},
    async handler({rawInput}) {
      const action = rawInput.trim() || 'status';
      if (action === 'cancel') {
        ctx.authorization.cancel(key);
        return {kind:'success', text:'ChatGPT sign-in cancelled.'};
      }
      if (action === 'status') {
        const record = await ctx.credentials.readRecord(key);
        return {kind:'success', text: record?.kind === 'grant'
          ? 'ChatGPT credentials are stored. Select the openai-codex provider in the model picker.'
          : [state, notice].filter(Boolean).join('\n')};
      }
      if (action !== 'login') return {kind:'error', text:'Use /chatgpt login, /chatgpt status or /chatgpt cancel.'};
      if (running) return {kind:'success', text:[state, notice].filter(Boolean).join('\n')};
      const flow = ctx.authorization.describe(key);
      if (!flow?.methods.some(method => method.id === 'oauth')) return {kind:'error',text:'The native openai-codex authorization flow is unavailable.'};
      running = true;
      failed = false;
      state = 'Waiting for ChatGPT sign-in';
      notice = '';
      let ready;
      const firstNotice = new Promise(resolve => { ready = resolve; });
      ctx.authorization.begin({key, method:'oauth', interaction:{
        notify(value) {
          const lines = [value.message];
          if (value.url) {
            const url = new URL(value.url);
            if (url.protocol === 'https:' && ['auth.openai.com','chatgpt.com'].includes(url.hostname)) lines.push(url.href);
          }
          if (value.code) lines.push('Verification code: ' + value.code);
          notice = lines.filter(Boolean).join('\n');
          ready();
        },
        prompt(prompt) {
          if (prompt.kind === 'select') {
            const choice = prompt.options.find(option => /browser/i.test(option.label ?? '')) ?? prompt.options[0];
            if (!choice?.id) return Promise.reject(new Error('Native login method is missing its identifier'));
            return Promise.resolve(choice.id);
          }
          return new Promise((resolve,reject) => {
            if (prompt.signal?.aborted) return reject(new Error('Sign-in cancelled'));
            prompt.signal?.addEventListener('abort',()=>reject(new Error('Sign-in cancelled')),{once:true});
          });
        }
      }}).then(result => {
        state = result.status === 'authorized' ? 'ChatGPT sign-in completed. Select openai-codex in the model picker.' : 'ChatGPT sign-in cancelled.';
        notice = '';
      }).catch(error => {
        failed = true;
        const message = error?.message ?? '';
        const reason = /unsupported.*login method|unknown.*login method/i.test(message) ? 'The native login method was rejected.'
          : /EADDRINUSE|address already in use/i.test(message) ? 'The browser callback port is already in use.'
          : /cancel/i.test(message) ? 'Sign-in was cancelled.'
          : /fetch failed|ENOTFOUND|ECONN|network/i.test(message) ? 'The OpenAI authentication endpoint could not be reached.'
          : 'The native authorization flow failed.';
        state = 'ChatGPT sign-in failed. ' + reason;
        notice = '';
      })
        .finally(() => { running = false; ready(); });
      await Promise.race([firstNotice, new Promise(resolve=>setTimeout(resolve,1500))]);
      return {kind:failed?'error':'success',text:[state,notice,...(running?['After completing browser sign-in, run /chatgpt status.']:[])].filter(Boolean).join('\n')};
    }
  });
}
