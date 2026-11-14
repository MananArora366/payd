/**
 * Minimal JSON Schema validator for MCP tool arguments.
 *
 * Supports the subset the Payd tool manifest uses: type (object, string,
 * number, integer, boolean, array), properties, required, additionalProperties
 * (false), enum, const, minimum, maximum, exclusiveMinimum, minLength,
 * maxLength, minItems, maxItems and items. The manifest and the validator
 * share one schema, so tools/list always advertises exactly what is enforced.
 */

export interface JsonSchema {
  type?: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array';
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  enum?: readonly (string | number | boolean)[];
  const?: string | number | boolean;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  items?: JsonSchema;
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function check(schema: JsonSchema, value: unknown, path: string, errors: string[]): void {
  const label = path || 'arguments';
  switch (schema.type) {
    case 'object': {
      if (typeOf(value) !== 'object') {
        errors.push(`${label} must be an object`);
        return;
      }
      const obj = value as Record<string, unknown>;
      for (const key of schema.required ?? []) {
        if (obj[key] === undefined) errors.push(`${path ? `${path}.` : ''}${key} is required`);
      }
      const props = schema.properties ?? {};
      for (const [key, v] of Object.entries(obj)) {
        const sub = props[key];
        const subPath = path ? `${path}.${key}` : key;
        if (!sub) {
          if (schema.additionalProperties === false) errors.push(`${subPath} is not a recognised argument`);
          continue;
        }
        if (v === undefined) continue;
        check(sub, v, subPath, errors);
      }
      return;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        errors.push(`${label} must be an array`);
        return;
      }
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        errors.push(`${label} must have at least ${schema.minItems} item(s)`);
      }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        errors.push(`${label} must have at most ${schema.maxItems} item(s)`);
      }
      if (schema.items) value.forEach((v, i) => check(schema.items!, v, `${label}[${i}]`, errors));
      return;
    }
    case 'string':
      if (typeof value !== 'string') {
        errors.push(`${label} must be a string`);
        return;
      }
      if (schema.minLength !== undefined && value.trim().length < schema.minLength) {
        errors.push(schema.minLength === 1 ? `${label} must not be empty` : `${label} must be at least ${schema.minLength} characters`);
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        errors.push(`${label} must be at most ${schema.maxLength} characters`);
      }
      break;
    case 'number':
    case 'integer':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        errors.push(`${label} must be a ${schema.type}`);
        return;
      }
      if (schema.type === 'integer' && !Number.isSafeInteger(value)) {
        errors.push(`${label} must be a whole number`);
        return;
      }
      if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${label} must be at least ${schema.minimum}`);
      if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
        errors.push(`${label} must be greater than ${schema.exclusiveMinimum}`);
      }
      if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${label} must be at most ${schema.maximum}`);
      break;
    case 'boolean':
      if (typeof value !== 'boolean') {
        errors.push(`${label} must be true or false (a JSON boolean)`);
        return;
      }
      break;
  }
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${label} must be ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.includes(value as string | number | boolean)) {
    errors.push(`${label} must be one of: ${schema.enum.join(', ')}`);
  }
}

/** Validates `value` against `schema`. Returns a list of human-readable problems (empty when valid). */
export function validateArgs(schema: JsonSchema, value: unknown): string[] {
  const errors: string[] = [];
  check(schema, value, '', errors);
  return errors;
}
