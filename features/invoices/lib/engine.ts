/**
 * The swappable extraction engine (ADR 0019). ONE function — `extractInvoice` —
 * is the seam: today it shells out to headless Claude Code on the home machine
 * (Max plan, Opus 4.8); swapping to the metered Anthropic API is a one-function
 * change documented below.
 *
 * Node-only (uses child_process + fs) — this runs from `scripts/extractInvoices.ts`
 * on the home machine, NOT in the browser bundle. Scanned PDFs need
 * `poppler-utils` provisioned (the New Surrey gap found in the planning spike).
 */
import { spawn } from "node:child_process";
import { EXTRACTION_PROMPT } from "./extractionPrompt";
import { parseExtractedInvoice } from "./extractedInvoice";
import type { ExtractedInvoice } from "./types";

/** Input to the engine: a local file path the engine can read (+ its mime). */
export type ExtractInput = {
  filePath: string;
  mime: string;
};

/** The model the home-machine engine runs (ADR 0019). */
const ENGINE_MODEL = "opus-4.8";

/**
 * Extract one invoice file into the strict `ExtractedInvoice` shape. Default
 * engine = home-machine Claude Code. The result is always validated through
 * `parseExtractedInvoice` before it leaves this function — the trust boundary.
 */
export async function extractInvoice(input: ExtractInput): Promise<ExtractedInvoice> {
  const raw = await runClaudeCode(input);
  return parseExtractedInvoice(raw);
}

/**
 * Home-machine engine: run `claude -p` headless with the extraction prompt,
 * pointing it at the local file. Claude Code reads the file (rendering scanned
 * PDFs via poppler) and prints the JSON to stdout.
 *
 * FALLBACK (one-function swap): replace this call with the metered Anthropic API
 * — upload the file, send EXTRACTION_PROMPT, read the JSON from the response.
 * Everything else (validation, the write-back) stays identical.
 */
function runClaudeCode(input: ExtractInput): Promise<string> {
  const prompt = `${EXTRACTION_PROMPT}\n\nThe invoice file is at: ${input.filePath}\n(mime: ${input.mime}). Read it and return the JSON.`;

  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      ["-p", prompt, "--model", ENGINE_MODEL, "--allowedTools", "Read"],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`claude exited ${code}: ${stderr.trim() || "no stderr"}`));
    });
  });
}
