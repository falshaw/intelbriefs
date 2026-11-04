"use client";

import { signIn } from "next-auth/react";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, Lock, Mail, MessageSquare, Search, TrendingUp } from "lucide-react";
import { AppBackground, LogoMark, WordMark } from "@/components/AppBackground";
import { ThemeToggle } from "@/components/ThemeToggle";

const FEATURES = [
  {
    icon: Search,
    title: "Quick or deep",
    text: "A few minutes or a full pass, on your own model.",
    tone: "bg-accent-soft text-accent",
  },
  {
    icon: MessageSquare,
    title: "Talking points",
    text: "5 to 7 openers, each tied to a source.",
    tone: "bg-teal-soft text-teal",
  },
  {
    icon: Eye,
    title: "Watchlist",
    text: "Re-runs on a schedule and shows what changed.",
    tone: "bg-amber-soft text-amber",
  },
  {
    icon: TrendingUp,
    title: "Competitor digest",
    text: "Weekly mentions, sorted and summarised.",
    tone: "bg-red-soft text-red",
  },
];

/** Only same-site paths are allowed as a post-login target. */
function safeCallback(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallback(searchParams.get("callbackUrl"));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const result = await signIn("credentials", {
      email: form.get("email") as string,
      password: form.get("password") as string,
      redirect: false,
      callbackUrl,
    });

    if (result?.error) {
      setError("Invalid email or password");
      setLoading(false);
    } else {
      router.push(callbackUrl);
      router.refresh();
    }
  }

  return (
    <>
      <AppBackground />
      <ThemeToggle className="fixed top-4 right-4 z-20" />

      <div className="mx-auto grid min-h-screen max-w-[1180px] gap-6 p-4 pt-16 lg:grid-cols-[1.2fr_1fr] lg:px-6 lg:py-8">
        <section className="glass flex flex-col !rounded-3xl p-[22px] lg:px-[34px] lg:py-[30px]">
          <div className="flex items-center gap-2.5 text-base font-bold">
            <LogoMark size={38} />
            <WordMark />
          </div>

          <div className="my-auto max-w-[460px] py-6 lg:py-10">
            <div className="eyebrow !text-accent mb-3">Meeting research</div>
            <h1 className="!text-[30px] lg:!text-[34px] !leading-[1.12] !tracking-[-0.03em]">
              Know who you are meeting,
              <br />
              <span className="accent-text">before the call.</span>
            </h1>
            <p className="mt-3.5 text-[15px] text-ink-65">
              Searches the web for a person or a company, then a local model
              writes the brief: who they are, what matters to them, talking
              points and risk signals. Quick or deep.
            </p>
            <ul className="mt-7 grid gap-3 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <li key={f.title} className="card flex gap-3 !rounded-2xl p-3.5">
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] ${f.tone}`}
                    aria-hidden
                  >
                    <f.icon className="h-4 w-4" />
                  </span>
                  <span>
                    <b className="block text-[13.5px] font-semibold">{f.title}</b>
                    <small className="text-[12.5px] text-ink-65">{f.text}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-[18px] text-[11.5px] text-ink-65">
            {[
              ["var(--ink-45)", "Runs locally"],
              ["var(--accent)", "MIT licensed"],
              ["var(--teal)", "Local model"],
            ].map(([c, t]) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: c }}
                  aria-hidden
                />
                {t}
              </span>
            ))}
          </div>
        </section>

        <section className="flex flex-col items-center justify-center pb-8 lg:p-6">
          <div className="w-full max-w-[340px]">
            <form onSubmit={handleSubmit} className="glass !rounded-3xl px-7 py-[30px]">
              <h1 className="!text-[22px]">Sign in</h1>
              <div className="mt-0.5 mb-[22px] text-[13px] text-ink-65">
                Welcome back
              </div>

              <div className="grid gap-3">
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute top-1/2 left-[13px] h-4 w-4 -translate-y-1/2 text-ink-45"
                    aria-hidden
                  />
                  <input
                    className="input input-glass !pl-10"
                    name="email"
                    type="email"
                    placeholder="Email"
                    aria-label="Email"
                    autoComplete="email"
                    autoFocus
                    required
                  />
                </div>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute top-1/2 left-[13px] h-4 w-4 -translate-y-1/2 text-ink-45"
                    aria-hidden
                  />
                  <input
                    className="input input-glass !pl-10"
                    name="password"
                    type="password"
                    placeholder="Password"
                    aria-label="Password"
                    autoComplete="current-password"
                    required
                  />
                </div>
              </div>

              {error && (
                <p className="mt-3 text-[13px] font-medium text-red" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary mt-5 !h-[46px] w-full shadow-[0_8px_22px_rgba(37,99,235,0.35)]"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>

              <div
                className="code mt-[22px] !rounded-[14px] !px-3.5 !py-3 !text-xs !whitespace-pre-wrap break-words"
                aria-label="Quick start"
              >
                <span className="k">brief</span> &quot;Northwind Traders&quot;{" "}
                <span className="s">--deep</span>
                {"\n"}
                <span className="c">
                  38 sources · 6 talking points · 2 risk signals
                </span>
              </div>
            </form>
            <div className="mt-[18px] text-center text-[11.5px] text-ink-45">
              Open source · github.com/falshaw/intelbriefs
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
