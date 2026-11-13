export function createToolBridge(ctx, sessionId) {
  return async function executeTool(name, args, signal) {
    if (typeof sessionId !== 'string' || !sessionId) throw new Error('No session scope is available.');
    const rpc=ctx.connection?.rpc;
    if (!rpc) throw new Error('Session tool execution is unavailable.');
    const response=await rpc.call('/api', 'openuiToolExecution/execute', {args:{agentId:sessionId, request:{name, arguments:args}}}, signal);
    if (!response.ok) throw new Error(response.error?.message || 'Tool request failed.');
    return response.value;
  };
}
