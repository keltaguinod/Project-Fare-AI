// ESM resolve hook: redirect `@mlc-ai/web-llm` to a tiny in-process stub so the
// AI pipeline tests can run in Node with no GPU and no real model download.
// Used by `npm test` via: node --loader ./tests/stub/webllm-loader.mjs ...
const STUB = new URL("./webllm-stub.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@mlc-ai/web-llm") {
    return { url: STUB, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
