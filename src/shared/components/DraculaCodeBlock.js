"use client";

// Dracula syntax-highlighted code block (Prism). Used for CLI Tools config
// snippets and Overview terminal header per E2E spec v7 — preset resmi Dracula.

import { useEffect, useState } from "react";
import prism from "prismjs";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-json";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-yaml";

let stylesInjected = false;

export default function DraculaCodeBlock({ code, language = "json", className }) {
  const [html, setHtml] = useState("");

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
      className={`p-4 bg-[#282a36] rounded-lg border border-[#44475a] overflow-x-auto font-mono text-[13px] leading-relaxed ${className || ""}`}
    >
      <code dangerouslySetInnerHTML={{ __html: html || code }} />
    </pre>
  );
}