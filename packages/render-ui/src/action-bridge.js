const MAX_REQUEST = 12000;
export function createActionBridge(ctx, sessionId) {
  return async function requestAgent(text) {
    if (typeof sessionId !== 'string' || !sessionId) throw new Error('No session scope is available.');
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_REQUEST) throw new Error('Agent request must be nonempty and at most 12,000 characters.');
    const binding = ctx.sessions?.binding(sessionId);
    const scope = binding?.ctx;
    const input = scope?.get('conversation')?.input;
    if (!input) throw new Error('Open the source chat to add this follow-up to its composer.');
    const result = input.requestDraftInitialization(binding, {prompt:text, whenDraftExists:'append'});
    if (result !== 'applied') throw new Error('The chat composer is busy. Try again in a moment.');
    input.for(scope).focus();
  };
}
export function actionRequest(event) {
  if (!event || typeof event !== 'object') throw new Error('Invalid action.');
  if (!['continue_conversation','continue','ContinueConversation','submit_form','SubmitForm'].includes(event.type)) throw new Error(`External action ${String(event.type)} is not enabled. Local UI state controls remain available.`);
  const text = event.params?.message ?? event.params?.text ?? event.params?.prompt ?? event.humanFriendlyMessage;
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_REQUEST) throw new Error('This action did not supply a valid bounded request.');
  let context = '';
  if(event.params?.context !== undefined) {
    // Format context data for the agent to interpret as tool parameters
    const ctxData = event.params.context;
    if (ctxData && typeof ctxData === 'object') {
      // If context contains a "tool" hint, format it as a tool request
      if (ctxData.tool) {
        context += '\nTool request: ' + String(ctxData.tool);
        if (ctxData.params && typeof ctxData.params === 'object') {
          context += '\nParameters: ' + JSON.stringify(ctxData.params);
        }
        // Include any additional context fields
        const extra = Object.entries(ctxData).filter(([k]) => k !== 'tool' && k !== 'params');
        if (extra.length) {
          context += '\nAdditional context: ' + JSON.stringify(Object.fromEntries(extra));
        }
      } else {
        context += '\nContext: ' + JSON.stringify(ctxData).slice(0, 4000);
      }
    } else {
      context += '\nContext: ' + String(ctxData).slice(0, 4000);
    }
  }
  if(event.formState && typeof event.formState === 'object') {
    let fields=0;
    function redact(value,depth=0) {
      if(++fields>1000||depth>8)throw new Error('Form data exceeds the submission budget.');
      if(Array.isArray(value))return value.map(v=>redact(v,depth+1));
      if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,/password|secret|credential|token|api.?key/i.test(key)?'[redacted]':redact(v,depth+1)]));
      return typeof value==='string'?value.slice(0,4000):value;
    }
    const clean=redact(event.formState);
    if(Object.keys(clean).length)context+='\nSubmitted form data (review before sending):\n'+JSON.stringify(clean,null,2);
  }
  if((text+context).length>MAX_REQUEST)throw new Error('Submitted request and form data exceed 12,000 characters.');
  return text+context;
}
