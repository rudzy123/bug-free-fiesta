import { ValidationError } from './errors.js';
import type { FieldOverlapPolicy, SignatureField } from './entities.js';

const MIN_NORMALIZED = 0;
const MAX_NORMALIZED = 1;
const EPSILON = 1e-9;

export type FieldBox = Pick<SignatureField, 'pageNumber' | 'x' | 'y' | 'width' | 'height'>;

export function assertFieldOnPage(input: { field: FieldBox; pageCount: number }): void {
  const { field, pageCount } = input;
  if (!Number.isInteger(field.pageNumber) || field.pageNumber < 1 || field.pageNumber > pageCount) {
    throw new ValidationError({
      field: 'pageNumber',
      reason: 'out_of_bounds',
      pageCount,
    });
  }
  for (const [name, value] of [
    ['x', field.x],
    ['y', field.y],
    ['width', field.width],
    ['height', field.height],
  ] as const) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new ValidationError({ field: name, reason: 'invalid' });
    }
  }
  if (field.width <= MIN_NORMALIZED || field.height <= MIN_NORMALIZED) {
    throw new ValidationError({ field: 'size', reason: 'non_positive' });
  }
  if (field.x < MIN_NORMALIZED || field.y < MIN_NORMALIZED) {
    throw new ValidationError({ field: 'origin', reason: 'out_of_bounds' });
  }
  if (
    field.x + field.width > MAX_NORMALIZED + EPSILON ||
    field.y + field.height > MAX_NORMALIZED + EPSILON
  ) {
    throw new ValidationError({ field: 'rectangle', reason: 'exceeds_page' });
  }
}

export function fieldsOverlap(left: FieldBox, right: FieldBox): boolean {
  if (left.pageNumber !== right.pageNumber) {
    return false;
  }
  const leftRight = left.x + left.width;
  const rightRight = right.x + right.width;
  const leftTop = left.y + left.height;
  const rightTop = right.y + right.height;
  const separated =
    leftRight <= right.x + EPSILON ||
    rightRight <= left.x + EPSILON ||
    leftTop <= right.y + EPSILON ||
    rightTop <= left.y + EPSILON;
  return !separated;
}

export function assertFieldLayout(input: {
  fields: readonly FieldBox[];
  pageCount: number;
  overlapPolicy: FieldOverlapPolicy;
}): void {
  if (input.pageCount < 1) {
    throw new ValidationError({ field: 'pageCount', reason: 'invalid' });
  }
  for (const field of input.fields) {
    assertFieldOnPage({ field, pageCount: input.pageCount });
  }
  if (input.overlapPolicy !== 'prohibit') {
    return;
  }
  for (let index = 0; index < input.fields.length; index += 1) {
    const current = input.fields[index];
    if (current === undefined) {
      continue;
    }
    for (let other = index + 1; other < input.fields.length; other += 1) {
      const candidate = input.fields[other];
      if (candidate !== undefined && fieldsOverlap(current, candidate)) {
        throw new ValidationError({ field: 'fields', reason: 'overlap_prohibited' });
      }
    }
  }
}
