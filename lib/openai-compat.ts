/**
 * Backup provider: any OpenAI-compatible chat API (default: Mistral's free tier).
 * Used only when Gemini is overloaded or out of quota, so a reviewer still gets a report.
 *
 *   FALLBACK_API_KEY   required to enable it (e.g. a Mistral key from console.mistral.ai)
 *   FALLBACK_BASE_URL  default https://api.mistral.ai/v1
 *   FALLBACK_MODEL     default mistral-small-latest
 */
import { GEMINI_RESPONSE_SCHEMA, LlmError, type LlmResult } from "./gemini";

export function fallbackConfigured(): boolean {
  return !!(process.env.FALLBACK_API_KEY || process.env.MISTRAL_API_KEY);
}

/** Convert Gemini's OpenAPI-style schema into standard JSON Schema. */
export function toJsonSchema(node: any): any {
  if (Array.isArray(node)) return node.map(toJsonSchema);
  if (!node || typeof node !== "object") return node;
  const out: any = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === "propertyOrdering" || k === "nullable") continue;
    if (k === "type") out.type = String(v).toLowerCase();
    else if (k === "properties") out.properties = Object.fromEntries(Object.entries(v as object).map(([pk, pv]) => [pk, toJsonSchema(pv)]));
    else out[k] = toJsonSchema(v);
  }
  if (node.nullable) out.type = [out.type, "null"];
  if (out.type === "object") out.additionalProperties = false;
  return out;
}

export async function callOpenAICompat(system: string, user: string, signal?: AbortSignal): Promise<LlmResult> {
  const key = process.env.FALLBACK_API_KEY || process.env.MISTRAL_API_KEY;
  if (!key) throw new LlmError("No backup model is configured.", 503);
  const base = (process.env.FALLBACK_BASE_URL || "https://api.mistral.ai/v1").replace(/\/$/, "");
  const model = process.env.FALLBACK_MODEL || "mistral-small-latest";
  const schema = toJsonSchema(GEMINI_RESPONSE_SCHEMA);

  // First try strict JSON-schema output; if the provider rejects that, fall back to plain JSON mode
  // with the schema spelled out in the prompt. zod validates the result either way.
  const formats = [
    { type: "json_schema", json_schema: { name: "triage_report", schema, strict: false } },
    { type: "json_object" },
  ];
  const problems: string[] = [];
  for (const response_format of formats) {
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        signal,
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 16384,
          response_format,
          messages: [
            {
              role: "system",
              content: `${system}\n\nReturn ONLY one JSON object that matches this JSON Schema exactly:\n${JSON.stringify(schema)}`,
            },
            { role: "user", content: user },
          ],
        }),
      });
    } catch (err) {
      if (signal?.aborted) throw new LlmError("The analysis timed out.", 504);
      throw new LlmError(`Could not reach the backup model (${(err as Error).message}).`, 503);
    }
    if (res.status === 400 && response_format.type === "json_schema") {
      problems.push(`${model}: structured-output mode rejected, retrying in JSON mode`);
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let msg = body;
      try {
        const j = JSON.parse(body);
        msg = j?.message ?? j?.error?.message ?? body;
      } catch {
        /* keep text */
      }
      throw new LlmError(
        `Backup model ${model}: HTTP ${res.status} (${String(msg).slice(0, 200)})`,
        res.status === 429 ? 429 : res.status === 401 || res.status === 403 ? 502 : 503,
      );
    }
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    try {
      return { json: JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")), model, latencyMs: Date.now() - started };
    } catch {
      problems.push(`${model}: answer was not valid JSON (finish reason ${data?.choices?.[0]?.finish_reason})`);
      continue;
    }
  }
  throw new LlmError(`The backup model could not produce a report. ${problems.join("; ")}`, 502);
}
