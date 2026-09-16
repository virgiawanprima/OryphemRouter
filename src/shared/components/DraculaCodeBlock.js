"use client";

// Tokyo Night syntax-highlighted code block (Prism). Used for CLI Tools config
// snippets and Overview terminal header.

import { useEffect, useState } from "react";
import prism from "prismjs";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-json";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-yaml";

let stylesInjected = false;

export default function DraculaCodeBlock({ code, language = "json", className }) {
  // Initialize with escaped code so the first render (before Prism runs)
  // doesn't inject raw, potentially user-controlled HTML via dangerouslySetInnerHTML.
  const escapeHtml = (str) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const [html, setHtml] = useState(() => escapeHtml(code || ""));

  useEffect(() => {
    if (!stylesInjected && typeof document !== "undefined") {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/prism-dracula.css";
      document.head.appendChild(link);
      stylesInjected = true;
    }
    const lang = prism.languages[language] ? language : "json";
    const highlighted = prism.highlight(code, prism.languages[lang], lang);
    setHtml(highlighted);
  }, [code, language]);

  return (
    <pre
      className={`p-4 bg-[color:var(--md-sys-color-surfaceContainerLowest)] rounded-lg border border-[color:var(--md-sys-color-outlineVariant)] overflow-x-auto font-mono text-[13px] leading-relaxed ${className || ""}`}
    >
      <style>{`
        pre code .token.comment, pre code .token.prolog, pre code .token.doctype, pre code .token.cdata { color: var(--color-text-muted); }
        pre code .token.punctuation { color: var(--color-text-secondary); }
        pre code .token.property, pre code .token.tag, pre code .token.constant, pre code .token.symbol { color: var(--color-danger); }
        pre code .token.boolean, pre code .token.number { color: var(--color-orange); }
        pre code .token.selector, pre code .token.attr-name, pre code .token.string, pre code .token.char { color: var(--color-green); }
        pre code .token.property-access { color: var(--color-cyan); }
        pre code .token.operator, pre code .token.entity, pre code .token.url, pre code .token.function { color: var(--color-cyan); }
        pre code .token.keyword { color: var(--color-purple); }
        pre code .token.atrule, pre code .token.attr-value, pre code .token.class-name { color: var(--color-yellow); }
        pre code .token.builtin { color: var(--color-purple); }
        pre code .token.regex, pre code .token.important, pre code .token.variable { color: var(--color-orange); }
      `}</style>
      <code dangerouslySetInnerHTML={{ __html: html || escapeHtml(code || "") }} />
    </pre>
  );
}