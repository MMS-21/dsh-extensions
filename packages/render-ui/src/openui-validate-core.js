import {createParser} from '@openuidev/react-lang';
import {repairStackAlignment} from './repair-stack.js';

const AST_KINDS = new Set(['Comp','Ref','StateRef','RuntimeRef','BinOp','UnaryOp','Ternary','Member','Index','Assign','Str','Num','Bool','Null','Arr','Obj','Ph']);
const MAX_DEPTH = 64;
const MAX_VALUES = 40_000;
const MAX_DIAGNOSTICS = 12;

function formatParserErrors(errors) {
  const groups = new Map();
  for (const error of errors) {
    const message = error.message || JSON.stringify(error);
    const key = JSON.stringify([error.component, message]);
    if (!groups.has(key)) {
      groups.set(key, {component: error.component, message, statements: new Set()});
    }
    if (error.statementId) groups.get(key).statements.add(error.statementId);
  }
  const lines = [...groups.values()].slice(0, MAX_DIAGNOSTICS).map(({component, message, statements}) => {
    const names = [...statements].slice(0, MAX_DIAGNOSTICS);
    if (statements.size > names.length) names.push(`+${statements.size - names.length} more statements`);
    const location = [names.join(', '), component].filter(Boolean).join(' → ');
    return (location ? location + ': ' : '') + message;
  });
  const remaining = groups.size - lines.length;
  if (remaining) lines.push(`+${remaining} more distinct validation issues.`);
  return lines.join('\n');
}

/**
 * Build a Lang normalizer for one library schema.
 *
 * The parser validates the program against the schema; the extra walk enforces
 * the plugin's own node/depth/statement budgets and rejects unsafe keys.
 */
export function createNormalizer(schema, root, meta) {
  const parser = createParser(schema, root);
  const fail = message => { throw new TypeError('Invalid OpenUI: '+message); };
  function checkKnownKeys(value, rule, depth=0) {
    if(depth > MAX_DEPTH)fail(`schema traversal exceeds depth limit (${MAX_DEPTH})`);
    // AST nodes (action steps, state refs, etc.) are validated by the parser itself.
    if (value && typeof value === 'object' && !Array.isArray(value) && AST_KINDS.has(value.k)) {
      if (value.k === 'Comp') {
        (value.args || []).forEach(v => checkKnownKeys(v, undefined, depth+1));
        Object.values(value.mappedProps || {}).forEach(v => checkKnownKeys(v, undefined, depth+1));
      } else if (value.k === 'Arr') {
        (value.els || []).forEach(v => checkKnownKeys(v, undefined, depth+1));
      } else if (value.k === 'Obj') {
        (value.entries || []).forEach(([,v]) => checkKnownKeys(v, undefined, depth+1));
      }
      return;
    }
    if(value===null || typeof value!=='object') {
      if(!rule)return;
      if(rule.$ref?.startsWith('#/$defs/'))rule=schema.$defs?.[rule.$ref.slice(8)] || rule;
      const alternatives=rule.anyOf || rule.oneOf;
      if(alternatives){
        const kind=value===null?'null':typeof value;
        const candidates=alternatives.filter(r=>r.$ref || r.type===kind || (kind==='number'&&r.type==='integer'));
        for(const candidate of candidates){try{checkKnownKeys(value,candidate,depth+1);return;}catch{}}
        if(candidates.length)fail('value exceeds allowed schema bounds');
      }
      if(rule.enum && !rule.enum.includes(value))fail('value is outside the allowed enum');
      if(typeof value==='string') {
        if(rule.maxLength!==undefined && value.length>rule.maxLength)fail('string exceeds schema limit');
        if(rule.minLength!==undefined && value.length<rule.minLength)fail('string is shorter than schema minimum');
        if(rule.pattern && !new RegExp(rule.pattern).test(value))fail('string does not match required format');
      }
      if(typeof value==='number') {
        if(!Number.isFinite(value))fail('numbers must be finite');
        if(rule.minimum!==undefined&&value<rule.minimum || rule.maximum!==undefined&&value>rule.maximum)fail('number exceeds schema bounds');
        if(rule.exclusiveMinimum!==undefined&&value<=rule.exclusiveMinimum || rule.exclusiveMaximum!==undefined&&value>=rule.exclusiveMaximum)fail('number exceeds exclusive schema bounds');
        if(rule.type==='integer'&&!Number.isInteger(value))fail('integer required');
      }
      return;
    }
    if(value.type==='element' && typeof value.typeName==='string') {
      const definition=schema.$defs?.[value.typeName];
      if(!definition)fail('unknown component '+value.typeName);
      checkKnownKeys(value.props,definition,depth+1);return;
    }
    if(!rule)return;
    if(rule.$ref?.startsWith('#/$defs/'))rule=schema.$defs?.[rule.$ref.slice(8)] || rule;
    const unions=rule.anyOf || rule.oneOf;
    if(unions) {
      const eligible=unions.filter(r=>r.$ref || (Array.isArray(value)?r.type==='array':r.type==='object'||r.properties));
      for(const r of eligible) {try {checkKnownKeys(value,r,depth+1);return;}catch {}}
      if(eligible.length)fail('data keys do not match any allowed schema');
    }
    if(Array.isArray(value)) {if(rule.maxItems!==undefined&&value.length>rule.maxItems)fail('array exceeds schema limit');value.forEach(v=>checkKnownKeys(v,rule.items,depth+1));return;}
    if(rule.properties) {
      for(const [key,child] of Object.entries(value)) {
        if(!(key in rule.properties) && rule.additionalProperties===false)fail('unknown property '+key);
        checkKnownKeys(child,rule.properties[key] || (typeof rule.additionalProperties==='object'?rule.additionalProperties:undefined),depth+1);
      }
    }
  }
  return function normalize(lang,title) {
    if(typeof lang!=='string'||!lang.trim()||lang.length>200000)fail('lang must contain 1–200000 characters');
    if(title!==undefined&&(typeof title!=='string'||title.length>200))fail('title must be at most 200 characters');
    if(/(?:javascript|vbscript)\s*:|data\s*:\s*text\/html/i.test(lang))fail('executable URLs are forbidden');
    let result;
    try {
      result = parser.parse(lang);
      if (result.meta.errors.some(error => error.component === 'Stack' && error.path === '/justify')) {
        const repaired = repairStackAlignment(lang);
        if (repaired !== lang) {
          lang = repaired;
          result = parser.parse(lang);
        }
      }
    } catch (error) { fail(error.message); }
    if(!result.root || result.meta.incomplete || result.meta.unresolved.length)fail('a complete root and all references are required');
    if(result.meta.errors.length)fail(formatParserErrors(result.meta.errors));
    if(result.meta.statementCount>1000)fail('at most 1000 statements');
    let count=0;
    function walk(value, location, depth = 0) {
      if (value?.type === 'element' && typeof value.statementId === 'string') {
        location = value.statementId + ' → ' + value.typeName;
      }
      if (value?.type === 'element' && value.typeName === 'Table' && Array.isArray(value.props?.columns)) {
        const columns = new Set();
        for (const column of value.props.columns) {
          const id = column?.statementId;
          if (typeof id !== 'string') continue;
          if (columns.has(id)) fail(`${location} repeats column "${id}". Use a distinct Col variable for each column.`);
          columns.add(id);
        }
      }
      if (depth > MAX_DEPTH) {
        fail(`nesting depth limit exceeded at ${location} (maximum ${MAX_DEPTH}). Flatten nested layouts or expressions in that section.`);
      }
      if (++count > MAX_VALUES) {
        fail(`expanded node count limit exceeded near ${location} (maximum ${MAX_VALUES} values). Reduce repeated content or data in the expanded view.`);
      }
      if(value?.k==='Obj' && value.entries?.some(([key])=>['__proto__','prototype','constructor'].includes(key)))fail('unsafe object key');
      if(value&&typeof value==='object') for(const [key,child] of Object.entries(value)) {
        if(['__proto__','prototype','constructor'].includes(key))fail('unsafe object key');
        walk(child, location, depth + 1);
      }
    }
    walk(result.root, 'root');
    walk(result.stateDeclarations, 'state declarations');
    walk(result.queryStatements, 'queries');
    walk(result.mutationStatements, 'mutations');
    checkKnownKeys(result.root);
    return {view:'openui',format:'openui-lang',...meta,lang,...(title===undefined?{}:{title})};
  };
}
