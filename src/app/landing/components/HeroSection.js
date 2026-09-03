"use client";

import { useRouter } from "next/navigation";

export default function HeroSection() {
  const router = useRouter();
  return (
    <section className="relative pt-32 pb-16 px-6 min-h-[90vh] flex flex-col items-center justify-center overflow-hidden">
      <div className="relative z-10 max-w-4xl w-full text-center flex flex-col items-center gap-7">
        <p className="font-mono uppercase tracking-[0.24em] text-[11px] text-teal-400">
          Open-source LLM gateway
        </p>

        <h1 className="text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight">
          One endpoint.<br />
          <span className="text-teal-400">Every provider.</span>
        </h1>

        <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto font-light">
          Route Claude Code, OpenAI Codex, Cline and RooCode through a single
          local API that picks the best model for each request.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 w-full">
          <button
            onClick={() => router.push("/dashboard")}
            className="h-12 px-8 rounded-lg bg-teal-400 hover:bg-teal-300 text-[#0b1018] text-base font-bold transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined">rocket_launch</span>
            Get Started
          </button>
          <a
            href="https://github.com/virgiawanprima/OryphemRouter"
            target="_blank"
            rel="noopener noreferrer"
            className="h-12 px-8 rounded-lg border border-[#2a3947] bg-[#121a26] hover:bg-[#1a2531] text-white text-base font-bold transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined">code</span>
            View on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
