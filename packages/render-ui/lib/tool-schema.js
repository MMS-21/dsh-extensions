/**
 * Minimal JSON Schema validation for tool arguments.
 *
 * The plugin deliberately does not depend on `@deepseek-ai/dsh-tools` at runtime
 * (it is a peer dependency that is not installed in every profile), so this
 * module provides the small subset of JSON Schema the tool catalog actually
 * uses. It returns human-readable violation strings, matching the shape the
 * caller already expects from the canonical validator.
 */

const SIMPLE_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null']);

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function matchesType(value, type) {
  switch (type) {
    case 'string': return typeof value === 'string'
    case 'number': return typeof value === 'number' && Number.isFinite(value)
    case 'integer': return typeof value === 'number' && Number.isInteger(value)
    case 'boolean': return typeof value === 'boolean'
    case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value)
    case 'array': return Array.isArray(value)
    case 'null': return value === null
    default: return true
  }
}

function describe(value) {
  const type = typeOf(value);
  if (type === 'string') return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value);
  if (type === 'object') return 'an object';
  if (type === 'array') return 'an array';
  return String(value);
}

/**
 * Validate one value against a JSON Schema subset.
 * @param schema - the schema object (or boolean).
 * @param value - the value to check.
 * @param path - label prefix used in violation messages.
 * @param violations - accumulator for violation strings.
 * @returns the same accumulator.
 */
export function validateJsonSchema(schema, value, path = 'value', violations = []) {
  if (schema === true || schema === undefined) return violations;
  if (schema === false) {
    violations.push(`${path}: no value is allowed here`);
    return violations;
  }
  if (typeof schema !== 'object' || Array.isArray(schema)) return violations;

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (types.some(type => SIMPLE_TYPES.has(type) && matchesType(value, type)) === false) {
      violations.push(`${path}: expected ${types.join(' or ')}, got ${describe(value)}`);
      return violations;
    }
  }

  if (schema.enum !== undefined && Array.isArray(schema.enum)
    && schema.enum.some(candidate => JSON.stringify(candidate) === JSON.stringify(value)) === false) {
    violations.push(`${path}: expected one of ${schema.enum.map(entry => JSON.stringify(entry)).join(', ')}`);
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      violations.push(`${path}: shorter than ${schema.minLength} characters`);
    }
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
      violations.push(`${path}: longer than ${schema.maxLength} characters`);
    }
    if (typeof schema.pattern === 'string') {
      try {
        if (new RegExp(schema.pattern).test(value) === false) violations.push(`${path}: does not match ${schema.pattern}`);
      } catch { /* an uncompilable pattern is treated as unconstrained */ }
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      violations.push(`${path}: must be >= ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      violations.push(`${path}: must be <= ${schema.maximum}`);
    }
  }

  if (Array.isArray(value) && schema.items !== undefined) {
    for (let index = 0; index < value.length; index++) {
      validateJsonSchema(schema.items, value[index], `${path}[${index}]`, violations);
    }
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const properties = schema.properties ?? {};
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!Object.hasOwn(value, key)) violations.push(`${path}.${key}: is required`);
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) {
        validateJsonSchema(properties[key], child, `${path}.${key}`, violations);
        continue;
      }
      const additional = schema.additionalProperties;
      if (additional === false) violations.push(`${path}.${key}: is not an allowed property`);
      else if (additional !== undefined && additional !== true) {
        validateJsonSchema(additional, child, `${path}.${key}`, violations);
      }
    }
  }

  return violations;
}

/**
 * Validate tool arguments against a tool definition's parameter schema.
 * @param schema - JSON Schema describing the arguments object.
 * @param value - the parsed arguments.
 * @param label - label used in messages (kept for call-site compatibility).
 * @returns violation strings; empty when the arguments are valid.
 */
export function validateJsonSchemaValue(schema, value, label = 'arguments') {
  if (schema === undefined || schema === null) return [];
  return validateJsonSchema(schema, value, label);
}
