// Minimal SERV Reasoning client (OpenAI chat-completions wire format) that
// records an audit entry for every call.

const BASE = process.env.SERV_BASE_URL || "https://inference-api.openserv.ai/v1";

// USD per 1M tokens (input, output), from docs.openserv.ai/serv-reasoning/models.
const PRICES = {
  "gpt-5.4-mini": [1.0, 6.0],
  "gpt-5.4-nano": [0.25, 1.6],
  "gpt-5.4": [3.25, 20.0],
  "gpt-5.6-luna": [0.25, 1.5],
  "gpt-6-luna": [0.13, 0.65],
  "claude-haiku-4.5": [1.25, 6.5],
  "claude-sonnet-5": [2.6, 13.0],
  "gemini-3.1-flash-lite": [0.3, 1.8],
};

export const servTool = {
  promptGuard: () => ({ type: "function", function: { name: "serv_prompt_guard" } }),
  shadowAgent: (hint, maxIterations = 3) => ({
    type: "function",
    function: {
      name: "serv_shadow_agent",
      description: "Enable SERV shadow-agent validation.",
      parameters: {
        type: "object",
        properties: {
          hint: { type: "string", default: hint },
          max_iterations: { type: "integer", default: maxIterations },
        },
      },
    },
  }),
};

export function hasKey() {
  return Boolean(process.env.SERV_API_KEY);
}

function baseModel(model) {
  return model.replace(/-serv-(kronos|multipath)(-multipath)?$/, "");
}

export async function servChat({ step, model, messages, tools, response_format, max_completion_tokens = 4000, reasoning_effort }) {
  if (!hasKey()) throw new Error("SERV_API_KEY is not set");
  const body = { model, messages, max_completion_tokens };
  if (tools?.length) body.tools = tools;
  if (response_format) body.response_format = response_format;
  if (reasoning_effort) body.reasoning_effort = reasoning_effort;

  const t0 = Date.now();
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SERV_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  const features = [
    /-serv-kronos/.test(model) && "Kronos prompt audit",
    /multipath/.test(model) && "Multipath",
    ...(tools || []).map((t) => t.function?.name).filter((n) => n?.startsWith("serv_")),
    response_format && "structured output",
  ].filter(Boolean);

  const usage = json.usage || {};
  const [pin, pout] = PRICES[baseModel(model)] || [0, 0];
  const audit = {
    step,
    model,
    features,
    status: res.status,
    ms,
    id: json.id || null,
    promptTokens: usage.prompt_tokens ?? null,
    completionTokens: usage.completion_tokens ?? null,
    estCostUsd: usage.prompt_tokens != null ? +(((usage.prompt_tokens * pin) + (usage.completion_tokens * pout)) / 1e6).toFixed(5) : null,
    finishReason: json.choices?.[0]?.finish_reason ?? null,
  };

  if (!res.ok) {
    const err = new Error(json.error?.message || `SERV ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    err.audit = audit;
    throw err;
  }
  return { content: json.choices?.[0]?.message?.content ?? "", json, audit };
}
