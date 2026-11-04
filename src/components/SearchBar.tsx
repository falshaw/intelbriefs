"use client";

import { useState } from "react";
import { Search, Loader2 } from "lucide-react";

interface SearchBarProps {
  onSubmit: (input: string, mode: "QUICK" | "DEEP") => void;
  loading?: boolean;
}

export default function SearchBar({ onSubmit, loading }: SearchBarProps) {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"QUICK" | "DEEP">("QUICK");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    onSubmit(input.trim(), mode);
  }

  return (
    <form onSubmit={submit} className="tile flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-0 flex-[1_1_320px]">
        <Search
          className="pointer-events-none absolute top-1/2 left-[13px] h-4 w-4 -translate-y-1/2 text-ink-45"
          aria-hidden
        />
        <input
          type="text"
          className="input input-glass !h-11 !pl-10"
          placeholder="Person or company, e.g. Jane Doe, Northwind Traders, or a LinkedIn URL"
          aria-label="Who to research"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
      </div>
      <div className="seg" role="group" aria-label="Research depth">
        {(["QUICK", "DEEP"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
          >
            {m === "QUICK" ? "Quick" : "Deep"}
          </button>
        ))}
      </div>
      <button
        type="submit"
        className="btn btn-primary !h-11 flex-auto sm:flex-none"
        disabled={!input.trim() || loading}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        New brief
      </button>
      <small className="basis-full text-xs text-ink-65">
        Quick takes about 4 to 5 minutes on a local model, Deep about 9.
      </small>
    </form>
  );
}
