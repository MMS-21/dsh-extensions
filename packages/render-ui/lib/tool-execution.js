import {randomUUID} from 'node:crypto';

const MAX_BYTES = 1_000_000;
export function validateToolRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).some(k => !['name','arguments'].includes(k))) throw new TypeError('Expected only tool name and arguments.');
  if (typeof request.name !== 'string' || !/^[a-zA-Z0-9_.-]{1,200}$/.test(request.name)) throw new TypeError('Invalid tool name.');
  if (!request.arguments || typeof request.arguments !== 'object' || Array.isArray(request.arguments)) throw new TypeError('Tool arguments must be an object.');
  let nodes=0;
  function walk(value, depth=0) {
    if (++nodes > 40000 || depth > 64) throw new TypeError('Tool arguments exceed structural limits.');
    if (!['object','string','number','boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) throw new TypeError('Tool arguments must be JSON.');
    if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
      if (['__proto__','prototype','constructor'].includes(key)) throw new TypeError('Unsafe argument key.');
      walk(child, depth+1);
    }
  }
  walk(request.arguments);
  const json=JSON.stringify(request.arguments);
  if (Buffer.byteLength(json)>MAX_BYTES) throw new TypeError('Tool arguments exceed 1 MB.');
  return {name:request.name, arguments:JSON.parse(json)};
}

// Always use the canonical executor with the gateway-resolved Agent. Do not call
// a definition's execute method, supply a fake parent, or replace the Agent scope.
// `ctx.tools.execute` is the BATCH api: it takes `calls` (id + name + JSON-string
// arguments) and settles every call, returning `{results, additionalContexts,
// concluded}` where each entry is `{callId, result}`.
export async function executeUiTool(ctx, agent, request, signal, validateSchema) {
  if (!agent?.session?.id || ctx.agents.get(agent.session.id) !== agent) throw new Error('A live session Agent is required.');
  signal.throwIfAborted();
  const input=validateToolRequest(request);
  if (input.name === 'render_ui' && Object.hasOwn(input.arguments, 'dataFile')) {
    throw new Error('Attach data snapshots from an agent turn.');
  }
  const definition=ctx.tools.get(input.name, agent);
  if (definition) {
    const violations=validateSchema(definition.parameters, input.arguments, 'arguments');
    if (violations.length) throw new TypeError('Invalid tool arguments: '+violations.slice(0,5).join('; '));
  }
  const batch=await ctx.tools.execute({
    calls:[{type:'tool-call', id:'openui-'+randomUUID(), name:input.name, arguments:JSON.stringify(input.arguments)}],
    agent,
    signal,
  });
  const entry=batch?.results?.[0];
  if (entry===undefined) throw new Error('Tool execution returned no result.');
  const result=entry.result;
  if (result?.isError) throw new Error(errorDetail(result));
  // Return data, not host execution metadata or deferred Agent contexts.
  const value=Object.hasOwn(result,'value') ? result.value : result.content;
  const json=JSON.stringify(value ?? null);
  if (Buffer.byteLength(json)>MAX_BYTES) throw new Error('Tool result exceeds the 1 MB inline data limit.');
  return JSON.parse(json);
}

/**
 * Flatten a thrown failure into a readable message. The canonical executor wraps
 * any unexpected throw in a batch-level error, so the useful cause sits one or
 * more levels down `cause`; without unwrapping it the caller only sees
 * "Tool batch execution failed".
 * @param error - thrown value.
 * @returns the deduplicated message chain, or a generic fallback.
 */
export function describeError(error) {
  const parts=[];
  const seen=new Set();
  let current=error;
  while (current && typeof current==='object' && !seen.has(current)) {
    seen.add(current);
    if (typeof current.message==='string' && current.message) parts.push(current.message);
    current=current.cause ?? current.info?.cause;
  }
  return parts.length ? [...new Set(parts)].join(': ') : String(error);
}

/**
 * Flatten a tool failure result into a readable message.
 * @param result - failed tool execution result.
 * @returns the deduplicated message chain, or a generic fallback.
 */
export function errorDetail(result) {
  const parts=[];
  const seen=new Set();
  let current=result?.error;
  while (current && typeof current==='object' && !seen.has(current)) {
    seen.add(current);
    if (typeof current.message==='string' && current.message) parts.push(current.message);
    current=current.cause ?? current.info?.cause;
  }
  if (parts.length===0) {
    const text=result?.content?.filter(block=>block?.type==='text').map(block=>block.text).join('\n');
    if (text) parts.push(text);
  }
  return parts.length ? [...new Set(parts)].join(': ') : 'Tool execution failed.';
}
