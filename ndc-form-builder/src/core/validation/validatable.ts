import { FieldMeta } from '../meta/meta-types';

export function isEffectivelyValidatable(
  path: string,
  meta: Record<string, FieldMeta>
): boolean {
  const parts = path.split('.');
  let current = '';

  for (const part of parts) {
    current = current ? `${current}.${part}` : part;

    const m = meta[current];
    if (m?.visible === false) return false;
    if (m?.validate === false) return false;
  }

  return true;
}

export default { isEffectivelyValidatable };
