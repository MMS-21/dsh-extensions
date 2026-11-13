// Recognize only the literal, unambiguous start/stretch swap in Stack calls.
// Preserve source offsets and ignore strings and comments while finding arguments.
const TOKEN = /"(?:\\[\s\S]|[^"\\])*"|\/\/[^\r\n]*|#[^\r\n]*|[A-Za-z_$@][\w$]*|[^\s]/g;
const CLOSE = {'(': ')', '[': ']', '{': '}'};

export function repairStackAlignment(lang) {
  const frames = [];
  const replacements = [];
  let previous;
  for (const token of lang.matchAll(TOKEN)) {
    const value = token[0];
    if (value.startsWith('//') || value.startsWith('#')) continue;
    const frame = frames.at(-1);
    if (Object.hasOwn(CLOSE, value)) {
      if (frame?.args) frame.current.push(token);
      frames.push(value === '(' && previous === 'Stack'
        ? {close: ')', args: [], current: []}
        : {close: CLOSE[value]});
    } else if (value === frame?.close) {
      frames.pop();
      if (frame.args) {
        frame.args.push(frame.current);
        const align = frame.args[3];
        const justify = frame.args[4];
        if (align?.length === 1 && align[0][0] === '"start"'
          && justify?.length === 1 && justify[0][0] === '"stretch"') {
          replacements.push([align[0].index, '"start"', '"stretch"']);
          replacements.push([justify[0].index, '"stretch"', '"start"']);
        }
      }
    } else if (frame?.args) {
      if (value === ',') {
        frame.args.push(frame.current);
        frame.current = [];
      } else {
        frame.current.push(token);
      }
    }
    previous = value;
  }
  if (replacements.length === 0) return lang;
  let offset = 0;
  const parts = [];
  for (const [start, before, after] of replacements.sort((a, b) => a[0] - b[0])) {
    parts.push(lang.slice(offset, start), after);
    offset = start + before.length;
  }
  return parts.join('') + lang.slice(offset);
}
