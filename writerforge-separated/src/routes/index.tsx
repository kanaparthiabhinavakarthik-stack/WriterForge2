import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useMemo, useRef, useState } from "react";

import { forgeSection, type ForgeResult } from "@/lib/forge.functions";
import { WORD_CEILING, chunkManuscript, countWords, readManuscriptFile } from "@/lib/manuscript";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WriterForge — Fix grammar and story flow in your novel" },
      {
        name: "description",
        content:
          "Upload a PDF or TXT manuscript, or paste your story, and WriterForge repairs grammar and rebuilds the flow of your storyline — up to 55,000 words.",
      },
      { property: "og:title", content: "WriterForge — Fix grammar and story flow in your novel" },
      {
        property: "og:description",
        content:
          "An AI writing forge for novelists: grammar polish and story-flow repair for manuscripts up to 55,000 words.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Mode = "grammar" | "flow";

function Index() {
  const runSection = useServerFn(forgeSection);

  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<Mode>("flow");
  const [intent, setIntent] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ForgeResult | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const words = useMemo(() => countWords(text), [text]);
  const over = words > WORD_CEILING;
  const pct = Math.min(100, Math.round((words / WORD_CEILING) * 100));

  const loadFile = useCallback(async (file: File) => {
    setError(null);
    setResult(null);
    try {
      const content = await readManuscriptFile(file);
      if (!content) throw new Error("That file had no readable text in it.");
      setText(content);
      setFileName(file.name);
      setPasting(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file could not be read.");
    }
  }, []);

  async function forge() {
    if (!words || over || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const chunks = chunkManuscript(text);
    setProgress({ done: 0, total: chunks.length });

    const revised: string[] = [];
    const notes: ForgeResult["notes"] = [];
    const beats: ForgeResult["beats"] = [];

    try {
      for (let i = 0; i < chunks.length; i++) {
        const part = await runSection({
          data: { mode, text: chunks[i], part: i + 1, total: chunks.length, intent },
        });
        revised.push(part.revised);
        notes.push(...part.notes);
        beats.push(...part.beats);
        setProgress({ done: i + 1, total: chunks.length });
      }
      setResult({ revised: revised.join("\n\n"), notes, beats });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The forge went cold. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!result) return;
    const blob = new Blob([result.revised], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (fileName?.replace(/\.[^.]+$/, "") ?? "manuscript") + "-writerforge.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-parchment text-ink font-body">
      <header className="border-b border-ink/12">
        <div className="mx-auto max-w-[420px] px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center size-7 rounded-[min(1vw,5px)] bg-ink text-parchment font-display font-semibold text-sm">
              W
            </span>
            <span className="font-display font-semibold text-[19px] tracking-tight">WriterForge</span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ash">Manuscript</span>
        </div>
      </header>

      <div className="mx-auto max-w-[420px] px-5">
        {/* 01 — intake */}
        <section className="pt-7">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ember mb-2">01 · Intake</p>
          <h1 className="font-display font-medium text-3xl leading-tight text-balance">
            Put your manuscript on the anvil.
          </h1>
          <p className="mt-2.5 text-[15px] leading-relaxed text-pretty text-ash max-w-[38ch]">
            Drag in a PDF or TXT, or paste the text yourself. We hold the heat steady up to a 55,000-word
            ceiling.
          </p>

          <div className="mt-4 rounded-[min(1vw,10px)] bg-parchment-2 ring-1 ring-ink/12 p-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void loadFile(file);
              }}
              className={`rounded-[min(1vw,6px)] border border-dashed p-5 text-center transition-colors ${
                dragging ? "border-ember bg-ember/10" : "border-ink/30 bg-parchment/60"
              }`}
            >
              <p className="font-display font-medium text-[15px]">
                {fileName ?? "Drop your manuscript here"}
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ash">
                PDF · TXT · up to 55,000 words
              </p>
            </div>

            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.txt,text/plain,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void loadFile(file);
              }}
            />

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => fileInput.current?.click()}
                className="h-11 rounded-[min(1vw,8px)] bg-ink text-parchment font-medium text-sm flex items-center justify-center gap-2"
              >
                <span className="size-4 grid place-items-center">
                  <span className="block w-[6px] h-[6px] rounded-full bg-ember" />
                </span>
                Upload file
              </button>
              <button
                onClick={() => setPasting((p) => !p)}
                className="h-11 rounded-[min(1vw,8px)] bg-transparent text-ink font-medium text-sm ring-1 ring-ink/25 flex items-center justify-center gap-2"
              >
                Paste text
              </button>
            </div>

            {pasting && (
              <textarea
                autoFocus
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setFileName(null);
                }}
                placeholder="Paste or write your story here…"
                className="mt-3 w-full h-48 rounded-[min(1vw,6px)] bg-parchment ring-1 ring-ink/15 p-3 text-[15px] leading-[1.72] outline-none focus:ring-ember/50 resize-y"
              />
            )}

            <div className="mt-3 flex items-center justify-between font-mono text-[11px]">
              <span className="text-ash">Word count</span>
              <span className={over ? "text-ember" : "text-ink"}>
                {words.toLocaleString()} <span className="text-ash">/ 55,000</span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-ink/10 overflow-hidden">
              <div className="h-full rounded-full bg-ember transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            {over && (
              <p className="mt-2 font-mono text-[10px] text-ember">
                Over the ceiling by {(words - WORD_CEILING).toLocaleString()} words.
              </p>
            )}
          </div>
        </section>

        {/* 02 — pass */}
        <section className="pt-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ember mb-2">
            02 · Choose the pass
          </p>
          <div className="rounded-[min(1vw,10px)] bg-parchment-2 ring-1 ring-ink/12 p-1.5 grid grid-cols-2 gap-1.5">
            <button
              onClick={() => setMode("grammar")}
              className={`h-11 rounded-[min(1vw,7px)] text-sm font-medium flex items-center justify-center gap-2 ${
                mode === "grammar" ? "bg-ember text-parchment" : "text-ash"
              }`}
            >
              Grammar polish
              {mode === "grammar" && (
                <span className="size-1.5 rounded-full bg-parchment animate-spark" />
              )}
            </button>
            <button
              onClick={() => setMode("flow")}
              className={`h-11 rounded-[min(1vw,7px)] text-sm font-medium flex items-center justify-center gap-2 ${
                mode === "flow" ? "bg-ember text-parchment" : "text-ash"
              }`}
            >
              Story-flow repair
              {mode === "flow" && <span className="size-1.5 rounded-full bg-parchment animate-spark" />}
            </button>
          </div>
          <input
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder="Your will: e.g. keep it grim, tighten chapter middles"
            className="mt-2 w-full h-11 rounded-[min(1vw,8px)] bg-parchment ring-1 ring-ink/15 px-3 text-sm outline-none focus:ring-ember/50"
          />
        </section>

        {/* 03 — working surface */}
        <section className="pt-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ember mb-2">
            03 · The working surface
          </p>

          <div className="rounded-[min(1vw,10px)] bg-parchment ring-1 ring-ink/12">
            <div className="flex items-center justify-between px-4 pt-3.5 pb-3 border-b border-ink/10">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ash">
                {fileName ?? (mode === "flow" ? "Story-flow repair" : "Grammar polish")}
              </span>
              <span className="font-mono text-[10px] text-ember">
                {busy
                  ? `${progress.done}/${progress.total} sections`
                  : result
                    ? `${result.notes.length} edits`
                    : "awaiting text"}
              </span>
            </div>

            <div className="px-4 py-3.5">
              {error && (
                <p className="font-mono text-[11px] text-ember leading-relaxed">{error}</p>
              )}

              {!error && !result && (
                <p className="font-body text-[15px] leading-[1.72] text-pretty text-ash">
                  {busy
                    ? "The forge is working through your manuscript, section by section. Long books take a few minutes."
                    : words
                      ? "Your manuscript is loaded. Choose a pass and forge it — the corrected text and the changes appear here."
                      : "Nothing on the anvil yet. Upload a PDF or TXT, or paste your story above."}
                </p>
              )}

              {result && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ember">
                      Corrected manuscript
                    </p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setShowOriginal((v) => !v)}
                        className="h-7 px-2.5 rounded-[min(1vw,5px)] ring-1 ring-ink/20 font-mono text-[10px] uppercase tracking-[0.12em] text-ash"
                      >
                        {showOriginal ? "Hide original" : "Original"}
                      </button>
                      <button
                        onClick={() => {
                          void navigator.clipboard.writeText(result.revised);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1600);
                        }}
                        className="h-7 px-2.5 rounded-[min(1vw,5px)] bg-ink text-parchment font-mono text-[10px] uppercase tracking-[0.12em]"
                      >
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>

                  <p className="mt-2 font-body text-[15px] leading-[1.72] text-pretty whitespace-pre-wrap max-h-[420px] overflow-y-auto rounded-[min(1vw,6px)] bg-parchment-2 ring-1 ring-ink/10 p-3">
                    {result.revised}
                  </p>

                  {showOriginal && (
                    <>
                      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ash">
                        Your original
                      </p>
                      <p className="mt-2 font-body text-[15px] leading-[1.72] text-pretty whitespace-pre-wrap max-h-[280px] overflow-y-auto rounded-[min(1vw,6px)] bg-parchment ring-1 ring-ink/10 p-3 text-ash">
                        {text}
                      </p>
                    </>
                  )}

                  {result.notes.length > 0 && (
                    <button
                      onClick={() => setShowNotes((v) => !v)}
                      className="mt-3 w-full h-9 rounded-[min(1vw,6px)] ring-1 ring-ink/20 font-mono text-[10px] uppercase tracking-[0.14em] text-ash"
                    >
                      {showNotes ? "Hide" : "Show"} the {result.notes.length} changes made
                    </button>
                  )}

                  {showNotes &&
                    result.notes.map((note, i) => (
                    <div
                      key={i}
                      className="mt-3 rounded-[min(1vw,6px)] bg-ember/10 ring-1 ring-ember/30 px-3 py-2.5"
                    >
                      <div className="font-body text-[15px] leading-[1.72] text-pretty">
                        <span className="line-through decoration-ember/50">{note.before}</span>
                        <span className="text-ember font-medium"> {note.after}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ember">
                          {note.kind}
                        </span>
                        <span className="font-mono text-[10px] text-ash text-right">{note.comment}</span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {result && result.beats.length > 0 && (
            <div className="mt-4 rounded-[min(1vw,10px)] bg-parchment-2 ring-1 ring-ink/12 p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ash mb-3">
                Chapter &amp; beat flow
              </p>
              <div className="relative flex gap-3">
                <div className="absolute left-[7px] top-1 bottom-1 w-px bg-ink/15" />
                <div className="flex flex-col gap-3.5">
                  {result.beats.map((beat, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span
                        className={`relative mt-1 size-3.5 rounded-full shrink-0 ring-2 ring-parchment-2 ${
                          beat.health === "runs hot" || beat.health === "drags" ? "bg-ember" : "bg-ink"
                        }`}
                      />
                      <div className="pb-1">
                        <p className="font-display font-medium text-[14px]">{beat.title}</p>
                        <p
                          className={`font-mono text-[10px] ${
                            beat.health === "runs hot" || beat.health === "drags"
                              ? "text-ember"
                              : "text-ash"
                          }`}
                        >
                          Beat {i + 1} · {beat.health} · {beat.summary}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* closing */}
        <section className="pt-9 pb-10">
          <div className="rounded-[min(1vw,10px)] bg-ink text-parchment px-5 py-5">
            <p className="font-display font-medium text-lg leading-snug text-balance">
              Hammered, not rewritten. You keep the quill; we only set the type.
            </p>
            <button
              onClick={() => void forge()}
              disabled={busy || !words || over}
              className="mt-3.5 h-11 w-full rounded-[min(1vw,8px)] bg-ember text-parchment font-medium text-sm disabled:opacity-40"
            >
              {busy
                ? `Forging… ${progress.done}/${progress.total}`
                : result
                  ? "Forge again"
                  : "Forge this manuscript"}
            </button>
            {result && (
              <button
                onClick={download}
                className="mt-2 h-11 w-full rounded-[min(1vw,8px)] ring-1 ring-parchment/30 text-parchment font-mono text-[11px] uppercase tracking-[0.14em]"
              >
                Download corrected manuscript
              </button>
            )}
          </div>
          <p className="mt-5 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-ash">
            For long manuscripts · 50,000 words and up
          </p>
        </section>
      </div>
    </div>
  );
}
