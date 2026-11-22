function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function matchesType(value, type) {
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'array') return Array.isArray(value);
  return typeOf(value) === type;
}

/**
 * Validate a value against the small JSON Schema subset the command registry uses.
 * Returns an empty string when the value is valid.
 */
export function validate(schema, value, path = '$') {
  if (!schema || typeof schema !== 'object') return '';
  if (schema.enum && !schema.enum.some((item) => Object.is(item, value))) {
    return `${path} must be one of ${schema.enum.join(', ')}`;
  }
  if (schema.type && !matchesType(value, schema.type)) {
    return `${path} must be ${schema.type}`;
  }
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) {
      return `${path} must be at least ${schema.minLength} characters`;
    }
    if (schema.maxLength != null && value.length > schema.maxLength) {
      return `${path} must be at most ${schema.maxLength} characters`;
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) return `${path} must be >= ${schema.minimum}`;
    if (schema.maximum != null && value > schema.maximum) return `${path} must be <= ${schema.maximum}`;
  }
  if (schema.type === 'array') {
    if (schema.items) {
      for (let i = 0; i < value.length; i += 1) {
        const message = validate(schema.items, value[i], `${path}[${i}]`);
        if (message) return message;
      }
    }
    return '';
  }
  if (schema.type === 'object') {
    const properties = schema.properties || {};
    for (const key of schema.required || []) {
      if (value[key] === undefined) return `${path}.${key} is required`;
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          return `${path}.${key} is not allowed`;
        }
      }
    }
    for (const [key, child] of Object.entries(properties)) {
      if (value[key] === undefined) continue;
      const message = validate(child, value[key], `${path}.${key}`);
      if (message) return message;
    }
  }
  return '';
}
