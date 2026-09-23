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
    let revised = data.text.trim();

    const notes: ForgeResult["notes"] = [];
    const beats: ForgeResult["beats"] = [];

    // ------------------------------------------------------------
    // 1. BASIC GRAMMAR / MECHANICS
    // ------------------------------------------------------------

    const original = revised;

    // Normalize excessive spaces.
    revised = revised
      .replace(/[ \t]{2,}/g, " ")
      .replace(/ +([,.!?;:])/g, "$1")
      .replace(/([,.!?;:])([A-Za-z])/g, "$1 $2");

    // Common subject-verb corrections.
    const grammarRules: Array<[RegExp, string, string, string]> = [
      [
        /\bI is\b/gi,
        "I am",
        "grammar",
        "Corrected subject-verb agreement.",
      ],
      [
        /\bI are\b/gi,
        "I am",
        "grammar",
        "Corrected subject-verb agreement.",
      ],
      [
        /\bhe are\b/gi,
        "he is",
        "grammar",
        "Corrected subject-verb agreement.",
      ],
      [
        /\bshe are\b/gi,
        "she is",
        "grammar",
        "Corrected subject-verb agreement.",
      ],
      [
        /\bthey is\b/gi,
        "they are",
        "grammar",
        "Corrected subject-verb agreement.",
      ],
      [
        /\bwe is\b/gi,
        "we are",
        "grammar",
        "Corrected subject-verb agreement.",
      ],
      [
        /\byou is\b/gi,
        "you are",
        "grammar",
        "Corrected subject-verb agreement.",
      ],
      [
        /\bhe don't\b/gi,
        "he doesn't",
        "grammar",
        "Corrected subject-verb agreement.",
      ],
      [
        /\bshe don't\b/gi,
        "she doesn't",
        "grammar",
        "Corrected subject-verb agreement.",
      ],
      [
        /\bit don't\b/gi,
        "it doesn't",
        "grammar",
        "Corrected subject-verb agreement.",
      ],
      [
        /\bthey doesn't\b/gi,
        "they don't",
        "grammar",
        "Corrected subject-verb agreement.",
      ],
      [
        /\bwe doesn't\b/gi,
        "we don't",
        "grammar",
        "Corrected subject-verb agreement.",
      ],
      [
        /\bI has\b/gi,
        "I have",
        "grammar",
        "Corrected subject-verb agreement.",
      ],
      [
        /\bthey has\b/gi,
        "they have",
        "grammar",
        "Corrected subject-verb agreement.",
      ],
      [
        /\bwe has\b/gi,
        "we have",
        "grammar",
        "Corrected subject-verb agreement.",
      ],
    ];

    for (const [pattern, replacement, kind, comment] of grammarRules) {
      const before = revised;
      revised = revised.replace(pattern, replacement);

      if (before !== revised && notes.length < 12) {
        notes.push({
          kind,
          before: before.slice(0, 160),
          after: revised.slice(0, 160),
          comment,
        });
      }
    }

    // Common verb mistakes.
    const verbRules: Array<[RegExp, string, string]> = [
      [/\bhe walk\b/gi, "he walks", "Corrected verb agreement."],
      [/\bshe walk\b/gi, "she walks", "Corrected verb agreement."],
      [/\bhe go\b/gi, "he goes", "Corrected verb agreement."],
      [/\bshe go\b/gi, "she goes", "Corrected verb agreement."],
      [/\bhe have\b/gi, "he has", "Corrected verb agreement."],
      [/\bshe have\b/gi, "she has", "Corrected verb agreement."],
      [/\bit have\b/gi, "it has", "Corrected verb agreement."],
      [/\bhe do\b/gi, "he does", "Corrected verb agreement."],
      [/\bshe do\b/gi, "she does", "Corrected verb agreement."],
    ];

    for (const [pattern, replacement, comment] of verbRules) {
      const before = revised;
      revised = revised.replace(pattern, replacement);

      if (before !== revised && notes.length < 12) {
        notes.push({
          kind: "grammar",
          before: before.slice(0, 160),
          after: revised.slice(0, 160),
          comment,
        });
      }
    }

    // Remove repeated words such as "the the".
    revised = revised.replace(
      /\b(\w+)\s+\1\b/gi,
      "$1",
    );

    // Capitalize the first letter after sentence-ending punctuation.
    revised = revised.replace(
      /([.!?]\s+)([a-z])/g,
      (_, punctuation: string, letter: string) =>
        punctuation + letter.toUpperCase(),
    );

    // ------------------------------------------------------------
    // 2. FLOW MODE
    // ------------------------------------------------------------

    if (data.mode === "flow") {
      // Remove very common redundant phrases.
      const flowRules: Array<[RegExp, string, string]> = [
        [
          /\bat this point in time\b/gi,
          "now",
          "Reduced an unnecessarily long phrase.",
        ],
        [
          /\bdue to the fact that\b/gi,
          "because",
          "Simplified a wordy transition.",
        ],
        [
          /\bin order to\b/gi,
          "to",
          "Simplified a wordy construction.",
        ],
        [
          /\bfor the purpose of\b/gi,
          "for",
          "Reduced unnecessary wording.",
        ],
        [
          /\bvery unique\b/gi,
          "unique",
          "Removed an unnecessary intensifier.",
        ],
      ];

      for (const [pattern, replacement, comment] of flowRules) {
        const before = revised;
        revised = revised.replace(pattern, replacement);

        if (before !== revised && notes.length < 12) {
          notes.push({
            kind: "flow",
            before: before.slice(0, 160),
            after: revised.slice(0, 160),
            comment,
          });
        }
      }

      // Remove consecutive duplicate sentences.
      const paragraphs = revised.split(/\n\s*\n/);

      const cleanedParagraphs: string[] = [];

      for (const paragraph of paragraphs) {
        const sentences = paragraph
          .split(/(?<=[.!?])\s+/)
          .filter(Boolean);

        const cleanedSentences: string[] = [];

        for (const sentence of sentences) {
          const previous =
            cleanedSentences[cleanedSentences.length - 1];

          if (
            previous &&
            previous.trim().toLowerCase() === sentence.trim().toLowerCase()
          ) {
            if (notes.length < 12) {
              notes.push({
                kind: "flow",
                before: sentence,
                after: "",
                comment: "Removed a duplicated sentence.",
              });
            }
            continue;
          }

          cleanedSentences.push(sentence);
        }

        cleanedParagraphs.push(cleanedSentences.join(" "));
      }

      revised = cleanedParagraphs.join("\n\n");
    }

    // ------------------------------------------------------------
    // 3. BUILD SIMPLE STORY BEATS
    // ------------------------------------------------------------

    const paragraphList = revised
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);

    if (paragraphList.length > 0) {
      const maxBeats = Math.min(5, paragraphList.length);

      for (let i = 0; i < maxBeats; i++) {
        const paragraph = paragraphList[i];

        const words = paragraph
          .replace(/\s+/g, " ")
          .trim()
          .split(" ");

        const summary =
          words.length > 35
            ? words.slice(0, 35).join(" ") + "..."
            : words.join(" ");

        let health = "steady";

        if (data.mode === "flow") {
          if (words.length < 12) {
            health = "drags";
          } else if (words.length > 80) {
            health = "runs hot";
          } else if (i === maxBeats - 1) {
            health = "resolves";
          }
        }

        beats.push({
          title: `Beat ${i + 1}`,
          summary,
          health,
        });
      }
    }

    // ------------------------------------------------------------
    // 4. FALLBACK NOTE
    // ------------------------------------------------------------

    if (original === revised && notes.length === 0) {
      notes.push({
        kind: data.mode === "grammar" ? "grammar" : "flow",
        before: original.slice(0, 160),
        after: revised.slice(0, 160),
        comment:
          data.mode === "grammar"
            ? "No obvious rule-based grammar problems were detected."
            : "No obvious rule-based flow problems were detected.",
      });
    }

    // ------------------------------------------------------------
    // 5. RETURN THE SAME SHAPE EXPECTED BY index.tsx
    // ------------------------------------------------------------

    return {
      revised,
      notes: notes.slice(0, 12),
      beats: beats.slice(0, 5),
    };
  });
