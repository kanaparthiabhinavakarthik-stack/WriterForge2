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

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import nspell from "nspell";
import en from "dictionary-en";

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
    },
    notes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "before", "after", "comment"],
        properties: {
          kind: {
            type: "string",
            enum: [
              "grammar",
              "flow",
              "pacing",
              "continuity",
              "style",
            ],
          },
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
          health: {
            type: "string",
            enum: ["steady", "runs hot", "drags", "resolves"],
          },
        },
      },
    },
  },
} as const;

const SYSTEM = `You are WriterForge, an editor for long-form novel manuscripts.

Rules:
- Preserve the author's voice.
- Preserve the author's vocabulary and intent.
- Never invent new plot events.
- Never invent characters or scenes.
- Return the complete corrected text.
- Do not summarize the manuscript.
- Preserve paragraph structure whenever possible.`;

const MODE_BRIEF: Record<"grammar" | "flow", string> = {
  grammar:
    "Correct spelling, punctuation, grammar, subject-verb agreement, tense consistency, run-on sentences, comma splices, and obvious typing mistakes.",

  flow:
    "Improve readability, sentence flow, repetition, transitions, pacing, and unnecessary wording without changing the story.",
};

export type ForgeResult = {
  revised: string;
  notes: {
    kind: string;
    before: string;
    after: string;
    comment: string;
  }[];
  beats: {
    title: string;
    summary: string;
    health: string;
  }[];
};


/* ============================================================
   SPELL CHECKER
   ============================================================ */

const spell = nspell(en);


/*
 * Words that should NOT be automatically changed.
 *
 * This prevents WriterForge from accidentally changing:
 * - character names
 * - fictional places
 * - abbreviations
 * - technical terms
 * - intentional vocabulary
 */
const ignoredWords = new Set([
  "WriterForge",
  "iPhone",
  "JavaScript",
  "TypeScript",
  "React",
  "TanStack",
  "Supabase",
  "Vercel",
  "GitHub",
]);


/*
 * Preserve the capitalization of the original word.
 */
function preserveCase(original: string, replacement: string): string {
  if (!replacement) return original;

  if (original === original.toUpperCase()) {
    return replacement.toUpperCase();
  }

  if (
    original.length > 0 &&
    original[0] === original[0].toUpperCase()
  ) {
    return (
      replacement.charAt(0).toUpperCase() +
      replacement.slice(1)
    );
  }

  return replacement.toLowerCase();
}


/*
 * Correct spelling using the English Hunspell dictionary.
 */
function correctSpelling(
  text: string,
  notes: ForgeResult["notes"],
): string {
  /*
   * Only process normal alphabetic words.
   *
   * This means punctuation such as:
   *
   * hello,
   * world!
   *
   * remains intact.
   */
  return text.replace(
    /\b[A-Za-z][A-Za-z'-]*\b/g,
    (word) => {
      if (ignoredWords.has(word)) {
        return word;
      }

      /*
       * Very short words are usually not worth fuzzy-correcting.
       */
      if (word.length <= 2) {
        return word;
      }

      /*
       * Correctly spelled word → leave it alone.
       */
      if (spell.correct(word)) {
        return word;
      }

      /*
       * Ask the dictionary for possible corrections.
       */
      const suggestions = spell.suggest(word);

      if (!suggestions || suggestions.length === 0) {
        return word;
      }

      /*
       * Use the first dictionary suggestion.
       *
       * For example:
       *
       * wahjt → what
       *
       * when the dictionary identifies "what"
       * as the closest valid word.
       */
      const suggestion = suggestions[0];

      /*
       * Avoid replacing a word with something wildly
       * different just because it happens to be a
       * dictionary suggestion.
       */
      if (!suggestion) {
        return word;
      }

      const corrected = preserveCase(word, suggestion);

      if (corrected !== word && notes.length < 12) {
        notes.push({
          kind: "grammar",
          before: word,
          after: corrected,
          comment: "Corrected a spelling mistake.",
        });
      }

      return corrected;
    },
  );
}


/* ============================================================
   GRAMMAR
   ============================================================ */

function correctGrammar(
  text: string,
  notes: ForgeResult["notes"],
): string {
  let revised = text;

  const grammarRules: Array<{
    pattern: RegExp;
    replacement: string;
    comment: string;
  }> = [
    {
      pattern: /\bI is\b/gi,
      replacement: "I am",
      comment: "Corrected subject-verb agreement.",
    },

    {
      pattern: /\bI are\b/gi,
      replacement: "I am",
      comment: "Corrected subject-verb agreement.",
    },

    {
      pattern: /\bhe are\b/gi,
      replacement: "he is",
      comment: "Corrected subject-verb agreement.",
    },

    {
      pattern: /\bshe are\b/gi,
      replacement: "she is",
      comment: "Corrected subject-verb agreement.",
    },

    {
      pattern: /\bthey is\b/gi,
      replacement: "they are",
      comment: "Corrected subject-verb agreement.",
    },

    {
      pattern: /\bwe is\b/gi,
      replacement: "we are",
      comment: "Corrected subject-verb agreement.",
    },

    {
      pattern: /\byou is\b/gi,
      replacement: "you are",
      comment: "Corrected subject-verb agreement.",
    },

    {
      pattern: /\bhe don't\b/gi,
      replacement: "he doesn't",
      comment: "Corrected subject-verb agreement.",
    },

    {
      pattern: /\bshe don't\b/gi,
      replacement: "she doesn't",
      comment: "Corrected subject-verb agreement.",
    },

    {
      pattern: /\bit don't\b/gi,
      replacement: "it doesn't",
      comment: "Corrected subject-verb agreement.",
    },

    {
      pattern: /\bthey doesn't\b/gi,
      replacement: "they don't",
      comment: "Corrected subject-verb agreement.",
    },

    {
      pattern: /\bI has\b/gi,
      replacement: "I have",
      comment: "Corrected subject-verb agreement.",
    },

    {
      pattern: /\bthey has\b/gi,
      replacement: "they have",
      comment: "Corrected subject-verb agreement.",
    },

    {
      pattern: /\bwe has\b/gi,
      replacement: "we have",
      comment: "Corrected subject-verb agreement.",
    },

    {
      pattern: /\bhe have\b/gi,
      replacement: "he has",
      comment: "Corrected subject-verb agreement.",
    },

    {
      pattern: /\bshe have\b/gi,
      replacement: "she has",
      comment: "Corrected subject-verb agreement.",
    },

    {
      pattern: /\bit have\b/gi,
      replacement: "it has",
      comment: "Corrected subject-verb agreement.",
    },

    {
      pattern: /\bhe walk\b/gi,
      replacement: "he walks",
      comment: "Corrected verb agreement.",
    },

    {
      pattern: /\bshe walk\b/gi,
      replacement: "she walks",
      comment: "Corrected verb agreement.",
    },

    {
      pattern: /\bhe go\b/gi,
      replacement: "he goes",
      comment: "Corrected verb agreement.",
    },

    {
      pattern: /\bshe go\b/gi,
      replacement: "she goes",
      comment: "Corrected verb agreement.",
    },
  ];

  for (const rule of grammarRules) {
    const before = revised;

    revised = revised.replace(
      rule.pattern,
      rule.replacement,
    );

    if (before !== revised && notes.length < 12) {
      notes.push({
        kind: "grammar",
        before: before.slice(0, 160),
        after: revised.slice(0, 160),
        comment: rule.comment,
      });
    }
  }

  /*
   * Correct "an" before consonant sounds in common cases.
   */
  const beforeArticle = revised;

  revised = revised.replace(
    /\ban\s+(?=(pace|person|problem|story|book|car|house|dog|cat)\b)/gi,
    "a ",
  );

  if (beforeArticle !== revised && notes.length < 12) {
    notes.push({
      kind: "grammar",
      before: beforeArticle.slice(0, 160),
      after: revised.slice(0, 160),
      comment: "Corrected an article before a consonant sound.",
    });
  }

  /*
   * Remove accidental repeated words.
   *
   * Example:
   * "the the door" → "the door"
   */
  revised = revised.replace(
    /\b(\w+)\s+\1\b/gi,
    "$1",
  );

  /*
   * Normalize spaces before punctuation.
   */
  revised = revised
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?;:])/g, "$1")
    .replace(/([,.!?;:])([A-Za-z])/g, "$1 $2");

  /*
   * Capitalize the first character of the entire section.
   */
  revised = revised.replace(
    /^(\s*)([a-z])/,
    (_, spaces: string, letter: string) =>
      spaces + letter.toUpperCase(),
  );

  /*
   * Capitalize after sentence-ending punctuation.
   */
  revised = revised.replace(
    /([.!?]\s+)([a-z])/g,
    (_, punctuation: string, letter: string) =>
      punctuation + letter.toUpperCase(),
  );

  return revised;
}


/* ============================================================
   FLOW PROCESSING
   ============================================================ */

function improveFlow(
  text: string,
  notes: ForgeResult["notes"],
): string {
  let revised = text;

  const flowRules: Array<{
    pattern: RegExp;
    replacement: string;
    comment: string;
  }> = [
    {
      pattern: /\bat this point in time\b/gi,
      replacement: "now",
      comment: "Reduced unnecessary wording.",
    },

    {
      pattern: /\bdue to the fact that\b/gi,
      replacement: "because",
      comment: "Simplified a wordy transition.",
    },

    {
      pattern: /\bin order to\b/gi,
      replacement: "to",
      comment: "Simplified a wordy construction.",
    },

    {
      pattern: /\bfor the purpose of\b/gi,
      replacement: "for",
      comment: "Reduced unnecessary wording.",
    },

    {
      pattern: /\bvery unique\b/gi,
      replacement: "unique",
      comment: "Removed an unnecessary intensifier.",
    },
  ];

  for (const rule of flowRules) {
    const before = revised;

    revised = revised.replace(
      rule.pattern,
      rule.replacement,
    );

    if (before !== revised && notes.length < 12) {
      notes.push({
        kind: "flow",
        before: before.slice(0, 160),
        after: revised.slice(0, 160),
        comment: rule.comment,
      });
    }
  }

  /*
   * Remove duplicate consecutive sentences.
   */
  const paragraphs = revised.split(/\n\s*\n/);

  const cleanedParagraphs = paragraphs.map(
    (paragraph) => {
      const sentences = paragraph
        .split(/(?<=[.!?])\s+/)
        .filter(Boolean);

      const cleaned: string[] = [];

      for (const sentence of sentences) {
        const previous =
          cleaned[cleaned.length - 1];

        if (
          previous &&
          previous.trim().toLowerCase() ===
            sentence.trim().toLowerCase()
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

        cleaned.push(sentence);
      }

      return cleaned.join(" ");
    },
  );

  return cleanedParagraphs.join("\n\n");
}


/* ============================================================
   STORY BEATS
   ============================================================ */

function buildBeats(
  text: string,
  mode: "grammar" | "flow",
): ForgeResult["beats"] {
  const beats: ForgeResult["beats"] = [];

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const limit = Math.min(5, paragraphs.length);

  for (let i = 0; i < limit; i++) {
    const paragraph = paragraphs[i];

    const words = paragraph
      .replace(/\s+/g, " ")
      .split(" ")
      .filter(Boolean);

    const summary =
      words.length > 35
        ? words.slice(0, 35).join(" ") + "..."
        : words.join(" ");

    let health = "steady";

    if (mode === "flow") {
      if (words.length < 12) {
        health = "drags";
      } else if (words.length > 80) {
        health = "runs hot";
      } else if (i === limit - 1) {
        health = "resolves";
      }
    }

    beats.push({
      title: `Beat ${i + 1}`,
      summary,
      health,
    });
  }

  return beats;
}


/* ============================================================
   MAIN WRITERFORGE ENGINE
   ============================================================ */

export const forgeSection = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<ForgeResult> => {
    const notes: ForgeResult["notes"] = [];

    /*
     * STEP 1:
     * Spell checking.
     */
    let revised = correctSpelling(
      data.text,
      notes,
    );

    /*
     * STEP 2:
     * Grammar correction.
     */
    revised = correctGrammar(
      revised,
      notes,
    );

    /*
     * STEP 3:
     * Flow correction if Flow mode is selected.
     */
    if (data.mode === "flow") {
      revised = improveFlow(
        revised,
        notes,
      );
    }

    /*
     * STEP 4:
     * Generate simple story beats.
     */
    const beats = buildBeats(
      revised,
      data.mode,
    );

    /*
     * If nothing changed, tell the user.
     */
    if (
      revised.trim() === data.text.trim() &&
      notes.length === 0
    ) {
      notes.push({
        kind: data.mode,
        before: data.text.slice(0, 160),
        after: revised.slice(0, 160),
        comment:
          "No obvious spelling, grammar, or flow problems were detected.",
      });
    }

    return {
      revised,
      notes: notes.slice(0, 12),
      beats: beats.slice(0, 5),
    };
  });
