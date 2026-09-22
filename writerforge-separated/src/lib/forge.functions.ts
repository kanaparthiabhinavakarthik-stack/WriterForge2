import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  mode: z.enum(["grammar", "flow"]),
  text: z.string().min(1).max(60000),
  part: z.number().int().min(1),
  total: z.number().int().min(1),
  intent: z.string().max(600).default(""),
});

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["revised", "notes", "beats"],
  properties: {
    revised: {
      type: "string",
      description: "The full corrected prose for this section, in the author's voice.",
    },
    notes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "before", "after", "comment"],
        properties: {
          kind: { type: "string", enum: ["grammar", "flow", "pacing", "continuity", "style"] },
          before: { type: "string" },
          after: { type: "string" },
          comment: { type: "string" },
        },
      },
    },
    beats: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "summary", "health"],
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          health: { type: "string", enum: ["steady", "runs hot", "drags", "resolves"] },
        },
      },
    },
  },
} as const;

const SYSTEM = `You are WriterForge, an editor for long-form novel manuscripts.
Rules you never break:
- Preserve the author's voice, vocabulary register, dialect and intent. You repair, you do not rewrite into your own style.
- Never invent new plot events, characters or scenes.
- Return the FULL text of the section in "revised" — never a summary, never placeholders.
- Keep paragraph breaks exactly where the author put them unless a fix requires otherwise.`;

const MODE_BRIEF: Record<"grammar" | "flow", string> = {
  grammar: `Task: grammar and mechanics pass. Fix spelling, punctuation, subject-verb agreement, tense consistency, run-ons, comma splices, awkward syntax and typos. In narration, correct non-standard grammar to standard English; inside quoted dialogue, keep a character's dialect exactly as written. Do not restructure scenes. "beats" may be an empty array. List the most significant fixes in "notes" (max 12).`,
  flow: `Task: story-flow repair. Fix the narrative flow of this section: pacing, beat order within the section, transitions, redundancy, weak cause-and-effect, and continuity of tense/POV. You may reorder or tighten sentences and paragraphs, but keep every plot event. Also fix outright grammar errors you meet. Fill "beats" with the 2-5 beats you found in this section and their health. List key changes in "notes" (max 12).`,
};

export type ForgeResult = {
  revised: string;
  notes: { kind: string; before: string; after: string; comment: string }[];
  beats: { title: string; summary: string; health: string }[];
};

export const forgeSection = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<ForgeResult> => {
    const apiKey = process.env["GEMINI_API_KEY"];

    if (!apiKey) {
      throw new Error("The writing engine is not configured yet.");
    }

    const instructions = [
      SYSTEM,
      MODE_BRIEF[data.mode],
      `This is section ${data.part} of ${data.total} of the manuscript.`,
      data.intent
        ? `The author's own instruction, which outranks defaults: ${data.intent}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const prompt = `${instructions}

Here is the manuscript section to process:

${data.text}`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },

        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],

          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: jsonSchema,
          },
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");

      if (response.status === 429) {
        throw new Error(
          "The writing engine is busy right now — try again in a moment.",
        );
      }

      if (response.status === 401 || response.status === 403) {
        throw new Error(
          "The Gemini API key is invalid or does not have permission to use the Gemini API.",
        );
      }

      throw new Error(
        `The writing engine refused this section (${response.status}). ${detail.slice(
          0,
          300,
        )}`,
      );
    }

    const result = await response.json();

    const outputText =
      result?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text ?? "")
        .join("") ?? "";

    if (!outputText.trim()) {
      throw new Error("The writing engine returned no usable result.");
    }

    try {
      const parsed = JSON.parse(outputText) as ForgeResult;

      return {
        revised: parsed.revised ?? "",
        notes: Array.isArray(parsed.notes)
          ? parsed.notes.slice(0, 12)
          : [],
        beats: Array.isArray(parsed.beats)
          ? parsed.beats.slice(0, 5)
          : [],
      };
    } catch {
      throw new Error(
        "The writing engine returned an invalid response format.",
      );
    }
  });
