/** Filter Codex sampling options before the native stream pipeline receives them. */
export function installCodexCompatibility(llm) {
  const original = llm.stream;
  function compatibleStream(options) {
    if (options.provider !== 'openai-codex' || !Object.hasOwn(options, 'temperature')) {
      return original.call(this, options);
    }
    const {temperature, ...compatible} = options;
    return original.call(this, compatible);
  }
  llm.stream = compatibleStream;
  return () => {
    if (llm.stream === compatibleStream) llm.stream = original;
  };
}
