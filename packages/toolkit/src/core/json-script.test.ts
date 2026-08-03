import { describe, it, expect } from 'vitest';
import { serializeForScriptTag } from './json-script';

describe('serializeForScriptTag', () => {
  it('escapes < so a payload cannot close its own script tag', () => {
    const hostile = { name: '</script><script>alert(1)</script>' };
    const out = serializeForScriptTag(hostile);

    expect(out).not.toContain('</script>');
    expect(out).not.toContain('<');
    expect(out).toContain('\\u003c');
  });

  it('round-trips to the identical value', () => {
    const value = {
      activeSegment: 'a<b>c&d',
      segments: [{ _id: '1', name: '</script>' }],
    };
    expect(JSON.parse(serializeForScriptTag(value))).toEqual(value);
  });

  it('escapes the JS line terminators that are legal inside JSON strings', () => {
    const sep = '\u2028\u2029';
    const out = serializeForScriptTag({ s: sep });
    expect(out).not.toContain('\u2028');
    expect(out).not.toContain('\u2029');
    expect(JSON.parse(out)).toEqual({ s: sep });
  });

  it('serializes undefined as null rather than emitting invalid JSON', () => {
    expect(serializeForScriptTag(undefined)).toBe('null');
    expect(() => JSON.parse(serializeForScriptTag(undefined))).not.toThrow();
  });
});
