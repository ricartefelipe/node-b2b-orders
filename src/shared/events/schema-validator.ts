import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';

const SCHEMAS_DIR = path.resolve(
  process.cwd(),
  'docs/contracts/schemas',
);

const EVENT_TO_SCHEMA_FILE: Record<string, string> = {
  'order.created': 'order.created.json',
  'order.confirmed': 'order.confirmed.json',
  'order.shipped': 'order.shipped.json',
  'order.delivered': 'order.delivered.json',
  'order.cancelled': 'order.cancelled.json',
  'payment.charge_requested': 'charge_requested.json',
  'charge_requested': 'charge_requested.json',
  'stock.reserved': 'inventory.reserved.json',
  'inventory.reserved': 'inventory.reserved.json',
  'inventory.released': 'inventory.released.json',
};

let compiledValidators: Map<string, ValidateFunction> | null = null;

function loadValidators(): Map<string, ValidateFunction> {
  if (compiledValidators) return compiledValidators;

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  compiledValidators = new Map();
  const compiledByFile = new Map<string, ValidateFunction>();

  for (const [eventType, schemaFile] of Object.entries(EVENT_TO_SCHEMA_FILE)) {
    const schemaPath = path.join(SCHEMAS_DIR, schemaFile);
    if (!fs.existsSync(schemaPath)) continue;

    let validate = compiledByFile.get(schemaFile);
    if (!validate) {
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      const schemaCopy = { ...schema, $id: undefined };
      validate = ajv.compile(schemaCopy);
      compiledByFile.set(schemaFile, validate);
    }
    compiledValidators.set(eventType, validate);
  }

  return compiledValidators;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * Validates an event payload against its JSON Schema.
 * @param eventType Event type (e.g. order.created, payment.charge_requested)
 * @param payload Event payload object
 * @returns Validation result with valid flag and optional error messages
 */
export function validateEventPayload(
  eventType: string,
  payload: unknown,
): ValidationResult {
  const validators = loadValidators();
  const validate = validators.get(eventType);

  if (!validate) {
    return { valid: false, errors: [`Unknown event type: ${eventType}`] };
  }

  const valid = validate(payload);
  if (valid) return { valid: true };

  const errors =
    validate.errors?.map(
      (e) => `${e.instancePath || '/'} ${e.message ?? e.keyword}`,
    ) ?? ['Validation failed'];

  return { valid: false, errors };
}

/**
 * Returns true if the event type has a registered schema.
 */
export function hasSchema(eventType: string): boolean {
  return eventType in EVENT_TO_SCHEMA_FILE;
}
