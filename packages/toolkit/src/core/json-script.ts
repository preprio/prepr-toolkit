/**
 * Serialize a value for embedding inside `<script type="application/json">`.
 *
 * `JSON.stringify` does not escape `<`, `>` or `&`, so a string value
 * containing `</script>` would close the tag early and let the remainder parse
 * as HTML — stored XSS whenever any part of the payload is author-controlled
 * (CMS segment names reach these components verbatim).
 *
 * Escaping `<` and `>` as `\uXXXX` keeps the output valid JSON that parses back
 * to the identical value, while making an early tag close impossible. `&` is
 * escaped too so the payload is also safe inside HTML-escaping contexts, and
 * U+2028/U+2029 because they are literal line terminators in JS source but
 * legal unescaped inside a JSON string.
 */
export function serializeForScriptTag(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
