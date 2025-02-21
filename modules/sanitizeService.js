// modules/sanitizeService.js
import sanitizeHtml from "sanitize-html";
import { ZodSchema } from "zod";

/**
 * Validate & sanitize data using a given Zod schema,
 * returning partial success if some fields fail.
 *
 * @param {Object} rawData - The raw input data object.
 * @param {ZodSchema} schema - The Zod schema that defines validation rules.
 * @param {Object} [options] - Additional options.
 * @param {boolean} [options.remainSpaces=false] - If true, keeps multiple spaces intact.
 * @returns {{
 *   valid: boolean,
 *   data: Object,        // fully valid fields or partially valid fields
 *   errors: Object       // field-by-field errors
 * }}
 */
export function validateAndSanitize(rawData, schema, { remainSpaces = false } = {}) {
  // 1) Sanitize & normalize all string fields
  const sanitizedData = {};

  for (const key in rawData) {
    let value = rawData[key];

    if (typeof value === "string") {
      // Step A: sanitize HTML
      let sanitizedValue = sanitizeHtml(value, {
        allowedTags: [],
        allowedAttributes: {},
      });

      // Step B: trim leading/trailing whitespace
      sanitizedValue = sanitizedValue.trim();

      // Step C: optionally collapse consecutive spaces
      if (!remainSpaces) {
        // Replace 2+ spaces with a single space
        sanitizedValue = sanitizedValue.replace(/\s{2,}/g, " ");
      }

      sanitizedData[key] = sanitizedValue;
    } else {
      // For non-strings, just copy over
      sanitizedData[key] = value;
    }
  }

  // 2) Validate using Zod's safeParse to avoid throwing
  const parseResult = schema.safeParse(sanitizedData);

  // 3a) If it's all valid, return everything
  if (parseResult.success) {
    return {
      valid: true,
      data: parseResult.data, // fully valid data
      errors: {},            // no errors
    };
  }

  // 3b) If not valid, build a field-by-field error map
  const errorMap = {};
  for (const issue of parseResult.error.issues) {
    // Usually, issue.path is an array of keys, e.g. ["address"] or ["someNested","field"]
    // We'll join them with "." so you can handle nested fields if needed
    const fieldKey = issue.path.join(".");
    if (!errorMap[fieldKey]) {
      errorMap[fieldKey] = [];
    }
    errorMap[fieldKey].push(issue.message);
  }

  // 4) Build partial data for fields that have no errors
  const partialData = {};
  for (const key of Object.keys(sanitizedData)) {
    if (!errorMap[key]) {
      // This field is not listed in the error map => keep it
      partialData[key] = sanitizedData[key];
    }
  }

  return {
    valid: false,
    data: partialData,  // partial (only fields that passed)
    errors: errorMap,   // which fields failed & why
  };
}
