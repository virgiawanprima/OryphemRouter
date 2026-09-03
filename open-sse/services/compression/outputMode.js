import { DEFAULT_CAVEMAN_OUTPUT_MODE_CONFIG } from "./types.js";
import { extractTextContent } from "./messageContent.js";
const SHARED_BOUNDARIES = "Code blocks, file paths, commands, errors, URLs: keep exact. Security warnings, irreversible action confirmations, multi-step ordered sequences: write normal. Resume terse style after. Active every response until user asks for normal mode.";
const CAVEMAN_INSTRUCTION_BY_LANGUAGE = {
  en: {
    lite: `Respond concise. Drop filler, pleasantries, hedging. Keep full sentences, technical terms, code, errors, URLs, and identifiers exact. ${SHARED_BOUNDARIES}`,
    full: `Respond terse like smart caveman. Drop articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries, hedging. Fragments OK. Short synonyms (big not extensive, fix not implement). Keep all technical substance, code, errors, URLs, identifiers exact. ${SHARED_BOUNDARIES}`,
    ultra: `Respond ultra terse. Maximum compression. Telegraphic. Abbreviate (DB/auth/config/req/res/fn/impl), strip conjunctions, arrows for causality (X \u2192 Y). One word when one word enough. Never abbreviate code symbols, API names, error strings, URLs, or identifiers. ${SHARED_BOUNDARIES}`
  },
  "pt-BR": {
    lite: `Responda conciso. Remova enrolacao, cortesias e incerteza. Preserve termos tecnicos, codigo, erros, URLs e identificadores exatamente. ${SHARED_BOUNDARIES}`,
    full: `Responda seco e compacto. Frases curtas OK. Preserve todo conteudo tecnico, codigo, erros, URLs e identificadores exatamente. ${SHARED_BOUNDARIES}`,
    ultra: `Responda ultra compacto. Use prosa tecnica curta e abreviacoes comuns como DB/auth/config/req/res/fn. Nunca abrevie simbolos de codigo, APIs, erros, URLs ou identificadores. ${SHARED_BOUNDARIES}`
  },
  es: {
    lite: `Responde conciso. Quita relleno, cortesias y dudas. Conserva terminos tecnicos, codigo, errores, URLs e identificadores exactos. ${SHARED_BOUNDARIES}`,
    full: `Responde seco y compacto. Fragmentos OK. Conserva todo el contenido tecnico, codigo, errores, URLs e identificadores exactos. ${SHARED_BOUNDARIES}`,
    ultra: `Responde ultra compacto. Usa prosa tecnica corta y abreviaturas comunes como DB/auth/config/req/res/fn. Nunca abrevies simbolos de codigo, APIs, errores, URLs o identificadores. ${SHARED_BOUNDARIES}`
  },
  de: {
    lite: `Antworte knapp. Entferne Fuellwoerter, Hoeflichkeit und Unsicherheit. Bewahre Fachbegriffe, Code, Fehler, URLs und Bezeichner exakt. ${SHARED_BOUNDARIES}`,
    full: `Antworte sehr knapp. Fragmente OK. Bewahre alle technischen Inhalte, Code, Fehler, URLs und Bezeichner exakt. ${SHARED_BOUNDARIES}`,
    ultra: `Antworte ultra knapp. Nutze kurze technische Prosa und uebliche Abkuerzungen wie DB/auth/config/req/res/fn. Code-Symbole, APIs, Fehler, URLs und Bezeichner nie abkuerzen. ${SHARED_BOUNDARIES}`
  },
  fr: {
    lite: `Reponds concis. Retire remplissage, politesses et hesitations. Garde termes techniques, code, erreurs, URLs et identifiants exacts. ${SHARED_BOUNDARIES}`,
    full: `Reponds tres compact. Fragments OK. Garde tout le contenu technique, code, erreurs, URLs et identifiants exacts. ${SHARED_BOUNDARIES}`,
    ultra: `Reponds ultra compact. Utilise une prose technique courte et des abreviations communes comme DB/auth/config/req/res/fn. N'abrege jamais symboles de code, APIs, erreurs, URLs ou identifiants. ${SHARED_BOUNDARIES}`
  },
  ja: {
    lite: `\u7C21\u6F54\u306B\u56DE\u7B54\u3002\u5197\u9577\u8868\u73FE\u3001\u6328\u62F6\u3001\u66D6\u6627\u8868\u73FE\u3092\u524A\u308B\u3002\u6280\u8853\u7528\u8A9E\u3001\u30B3\u30FC\u30C9\u3001\u30A8\u30E9\u30FC\u3001URL\u3001\u8B58\u5225\u5B50\u306F\u6B63\u78BA\u306B\u4FDD\u6301\u3002${SHARED_BOUNDARIES}`,
    full: `\u77ED\u304F\u5727\u7E2E\u3057\u3066\u56DE\u7B54\u3002\u65AD\u7247\u6587\u53EF\u3002\u6280\u8853\u5185\u5BB9\u3001\u30B3\u30FC\u30C9\u3001\u30A8\u30E9\u30FC\u3001URL\u3001\u8B58\u5225\u5B50\u306F\u6B63\u78BA\u306B\u4FDD\u6301\u3002${SHARED_BOUNDARIES}`,
    ultra: `\u8D85\u77ED\u304F\u56DE\u7B54\u3002DB/auth/config/req/res/fn \u306A\u3069\u4E00\u822C\u7684\u306A\u7565\u8A9E\u306F\u53EF\u3002\u30B3\u30FC\u30C9\u8A18\u53F7\u3001API\u540D\u3001\u30A8\u30E9\u30FC\u6587\u5B57\u5217\u3001URL\u3001\u8B58\u5225\u5B50\u306F\u7701\u7565\u3057\u306A\u3044\u3002${SHARED_BOUNDARIES}`
  },
  id: {
    lite: `Jawab ringkas. Hapus pengisi, salam sopan santun, keraguan. Pertahankan istilah teknis, kode, error, URL, & identifier secara persis. ${SHARED_BOUNDARIES}`,
    full: `Jawab sangat singkat ala caveman pintar. Hapus kata pengisi (hanya/sangat/sebenarnya), salam sopan santun. Kalimat pendek/tidak lengkap OK. Gunakan sinonim pendek. Pertahankan semua substansi teknis, kode, error, URL, & identifier secara persis. ${SHARED_BOUNDARIES}`,
    ultra: `Jawab ultra singkat. Kompresi maksimal. Gunakan singkatan umum (DB/auth/config/req/res/fn/impl), hilangkan kata hubung, gunakan panah untuk kausalitas (X \u2192 Y). Satu kata jika cukup. Jangan singkat simbol kode, nama API, string error, URL, atau identifier. ${SHARED_BOUNDARIES}`
  },
  vi: {
    lite: `Tr\u1EA3 l\u1EDDi s\xFAc t\xEDch. B\u1ECF t\u1EEB \u0111\u1EC7m, s\xE1o r\u1ED7ng, r\xE0o \u0111\xF3n. Gi\u1EEF nguy\xEAn c\xE2u ho\xE0n ch\u1EC9nh, thu\u1EADt ng\u1EEF k\u1EF9 thu\u1EADt, code, l\u1ED7i, URL v\xE0 \u0111\u1ECBnh danh. ${SHARED_BOUNDARIES}`,
    full: `Tr\u1EA3 l\u1EDDi c\u1ED9c l\u1ED1c nh\u01B0 ng\u01B0\u1EDDi t\u1ED1i c\u1ED5 th\xF4ng minh. B\u1ECF m\u1EA1o t\u1EEB, t\u1EEB \u0111\u1EC7m, s\xE1o r\u1ED7ng, r\xE0o \u0111\xF3n. Ch\u1EA5p nh\u1EADn c\xE2u r\xFAt g\u1ECDn. D\xF9ng t\u1EEB \u0111\u1ED3ng ngh\u0129a ng\u1EAFn. Gi\u1EEF nguy\xEAn m\u1ECDi n\u1ED9i dung k\u1EF9 thu\u1EADt, code, l\u1ED7i, URL v\xE0 \u0111\u1ECBnh danh. ${SHARED_BOUNDARIES}`,
    ultra: `Tr\u1EA3 l\u1EDDi c\u1EF1c k\u1EF3 c\u1ED9c l\u1ED1c. N\xE9n t\u1ED1i \u0111a. Nh\u01B0 \u0111i\u1EC7n t\xEDn. Vi\u1EBFt t\u1EAFt (DB/auth/config/req/res/fn/impl), b\u1ECF li\xEAn t\u1EEB, d\xF9ng m\u0169i t\xEAn cho quan h\u1EC7 nh\xE2n qu\u1EA3 (X \u2192 Y). M\u1ED9t t\u1EEB n\u1EBFu m\u1ED9t t\u1EEB l\xE0 \u0111\u1EE7. Kh\xF4ng bao gi\u1EDD vi\u1EBFt t\u1EAFt k\xFD hi\u1EC7u code, t\xEAn API, chu\u1ED7i l\u1ED7i, URL ho\u1EB7c \u0111\u1ECBnh danh. ${SHARED_BOUNDARIES}`
  }
};
const CAVEMAN_OUTPUT_MARKER = "[OmniRoute Caveman Output Mode]";
function shouldBypassCavemanOutputMode(messages) {
  const text = messages.slice(-3).map((message) => extractTextContent(message.content).toLowerCase()).join("\n");
  if (!text.trim()) return null;
  if (/\b(security|vulnerability|exploit|credential leak|secret leak|malware|phishing)\b/.test(text)) {
    return "security_warning";
  }
  if (/\b(delete|drop table|truncate|destroy|wipe|irreversible|permanently remove)\b/.test(text)) {
    return "irreversible_action";
  }
  if (/\b(clarify|explain in detail|more detail|step by step|why exactly|what do you mean)\b/.test(
    text
  )) {
    return "clarification_requested";
  }
  if (/\b(first|then|after that|before|rollback|backup)\b[\s\S]{0,240}\b(delete|drop|migrate|deploy|release)\b/.test(
    text
  )) {
    return "order_sensitive_sequence";
  }
  return null;
}
function buildCavemanOutputInstruction(config, language = "en") {
  const intensity = config.intensity ?? "full";
  const instructions = CAVEMAN_INSTRUCTION_BY_LANGUAGE[language] ?? CAVEMAN_INSTRUCTION_BY_LANGUAGE.en;
  return `${CAVEMAN_OUTPUT_MARKER}
${instructions[intensity]}`;
}
function applyCavemanOutputMode(body, options, language = "en") {
  const config = {
    ...DEFAULT_CAVEMAN_OUTPUT_MODE_CONFIG,
    ...options
  };
  if (!config.enabled) return { body, applied: false, skippedReason: "disabled" };
  const messages = Array.isArray(body.messages) ? body.messages : null;
  if (!messages || messages.length === 0) {
    const instruction2 = buildCavemanOutputInstruction(config, language);
    if (typeof body.instructions === "string") {
      if (body.instructions.includes(CAVEMAN_OUTPUT_MARKER)) {
        return { body, applied: false, skippedReason: "already_applied" };
      }
      return {
        body: {
          ...body,
          instructions: `${body.instructions.trim()}

${instruction2}`
        },
        applied: true
      };
    }
    if (typeof body.input === "string" || Array.isArray(body.input)) {
      return { body: { ...body, instructions: instruction2 }, applied: true };
    }
    return { body, applied: false, skippedReason: "no_messages" };
  }
  const alreadyApplied = messages.some(
    (message) => message.role === "system" && typeof message.content === "string" && message.content.includes(CAVEMAN_OUTPUT_MARKER)
  );
  if (alreadyApplied) return { body, applied: false, skippedReason: "already_applied" };
  if (config.autoClarity !== false) {
    const bypass = shouldBypassCavemanOutputMode(messages);
    if (bypass) return { body, applied: false, skippedReason: bypass };
  }
  const instruction = buildCavemanOutputInstruction(config, language);
  const nextMessages = [...messages];
  const first = nextMessages[0];
  if (first?.role === "system" && typeof first.content === "string") {
    nextMessages[0] = {
      ...first,
      content: `${first.content.trim()}

${instruction}`
    };
  } else {
    nextMessages.unshift({ role: "system", content: instruction });
  }
  return { body: { ...body, messages: nextMessages }, applied: true };
}
export {
  CAVEMAN_INSTRUCTION_BY_LANGUAGE,
  SHARED_BOUNDARIES,
  applyCavemanOutputMode,
  buildCavemanOutputInstruction,
  shouldBypassCavemanOutputMode
};
