import { describe, expect, it } from 'vitest';

import { resolveFeatures } from './features';

describe('resolveFeatures', () => {
  it('enables everything when no config is given', () => {
    expect(resolveFeatures()).toEqual({
      segments: true,
      abTesting: true,
      editMode: true,
    });
  });

  it('treats an omitted key as enabled', () => {
    expect(resolveFeatures({ segments: false })).toEqual({
      segments: false,
      abTesting: true,
      editMode: true,
    });
  });

  it('accepts the boolean shorthand', () => {
    const resolved = resolveFeatures({ abTesting: false, editMode: true });
    expect(resolved.abTesting).toBe(false);
    expect(resolved.editMode).toBe(true);
  });

  it('accepts the object form', () => {
    expect(resolveFeatures({ editMode: { enabled: false } }).editMode).toBe(
      false,
    );
  });

  it('treats an empty object as enabled', () => {
    expect(resolveFeatures({ segments: {} }).segments).toBe(true);
  });
});
