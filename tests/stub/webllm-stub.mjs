// Fake @mlc-ai/web-llm for Node tests (no WebGPU). The fake engine's replies
// come from globalThis.__reply(request) so each test controls what "the model"
// says. This mirrors the real library's surface used by src/ai/ai.js.

export async function hasModelInCache() {
  return false;
}

export async function CreateMLCEngine(modelId, opts) {
  opts?.initProgressCallback?.({ progress: 1, text: `stub: ${modelId} ready` });
  return {
    chat: {
      completions: {
        create: async (request) => {
          const content =
            typeof globalThis.__reply === "function" ? globalThis.__reply(request) : "{}";
          return { choices: [{ message: { content } }] };
        },
      },
    },
  };
}
