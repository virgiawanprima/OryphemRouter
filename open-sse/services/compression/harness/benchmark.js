import { registerBuiltinCompressionEngines } from "../engines/index.js";
import { getCompressionEngine } from "../engines/registry.js";
import { runCompressionEval } from "./runner.js";
import {
  checkTokensPerTaskGate
} from "./budgetGate.js";
registerBuiltinCompressionEngines();
const BENCHMARK_CORPUS = [
  // ── Prose ────────────────────────────────────────────────────────────────
  {
    id: "prose-1",
    task: "prose",
    input: [
      "Actually, I think what you basically want to do is essentially iterate over the list",
      "of files and then kind of process each one in turn. So basically what I mean is that",
      "you should loop through them one by one. In other words, just go through each file",
      "in the directory and perform the operation. Does that make sense? Let me know if you",
      "need any clarification on this matter whatsoever.",
      "",
      "So anyway, the main takeaway here is that you need to call processFile() for each",
      "item in the files array. That is essentially the core of what I am trying to convey."
    ].join("\n")
  },
  {
    id: "prose-2",
    task: "prose",
    input: [
      "I would like to add that, at the end of the day, the solution involves calling",
      "https://api.example.com/v2/process with the API_KEY environment variable set.",
      "The endpoint version is v2.3.1 and you must pass X-Request-Id in the headers.",
      "",
      "Please note that basically every request needs authentication via the Bearer token.",
      "So in other words you should include Authorization: Bearer <token> in every call.",
      "The error.message field will contain details when a 401 or 403 occurs."
    ].join("\n")
  },
  // ── Tool output ──────────────────────────────────────────────────────────
  {
    id: "tool-output-1",
    task: "tool-output",
    input: [
      "$ npm install",
      "npm warn deprecated inflight@1.0.6: This module is not supported",
      "npm warn deprecated inflight@1.0.6: This module is not supported",
      "npm warn deprecated inflight@1.0.6: This module is not supported",
      "npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported",
      "npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported",
      "npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported",
      "npm warn deprecated rimraf@3.0.2: Rimraf versions prior to v4 are no longer supported",
      "",
      "added 1234 packages, and audited 1234 packages in 42s",
      "",
      "found 0 vulnerabilities"
    ].join("\n")
  },
  {
    id: "tool-output-2",
    task: "tool-output",
    input: [
      "tests/unit/foo.test.ts ..........",
      "tests/unit/bar.test.ts ..........",
      "tests/unit/baz.test.ts ..........",
      "tests/unit/qux.test.ts ..........",
      "tests/unit/foo.test.ts ..........",
      "tests/unit/bar.test.ts ..........",
      "tests/unit/baz.test.ts ..........",
      "tests/unit/qux.test.ts ..........",
      "  \u2713 all 80 tests passed",
      "  coverage: 87.3% statements",
      "Error: ENOENT: no such file or directory '/tmp/cache/build.lock'"
    ].join("\n")
  },
  // ── JSON / structured ────────────────────────────────────────────────────
  {
    id: "json-1",
    task: "json",
    input: JSON.stringify(
      {
        model: "gpt-4o",
        usage: { prompt_tokens: 1200, completion_tokens: 350, total_tokens: 1550 },
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: "The file src/lib/db/core.ts exports getDbInstance() which returns the WAL-mode SQLite singleton."
            }
          },
          {
            index: 1,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: "Call getDbInstance() from src/lib/db/core.ts to obtain the DB handle."
            }
          }
        ],
        id: "chatcmpl-abc123",
        created: 1718e6
      },
      null,
      2
    )
  }
];
function engineToCompressFn(engineId) {
  const engine = getCompressionEngine(engineId);
  if (!engine) {
    throw new Error(`Unknown compression engine: "${engineId}"`);
  }
  return async (text) => {
    const body = {
      messages: [{ role: "user", content: text }],
      // #7746 follow-up: CCR only compresses for callers that advertise the
      // omniroute_ccr_retrieve tool (otherwise its content-addressed marker is
      // unresolvable). Real CCR traffic always carries this tool, so the
      // benchmark must too, or CCR measures as a no-op. Other engines ignore
      // the `tools` field, so this is inert for them.
      tools: [{ type: "function", function: { name: "omniroute_ccr_retrieve" } }]
    };
    try {
      let result;
      if (typeof engine.applyAsync === "function") {
        result = await engine.applyAsync(body);
      } else {
        result = engine.apply(body);
      }
      const messages = result.body["messages"];
      if (Array.isArray(messages) && messages.length > 0) {
        for (let i = messages.length - 1; i >= 0; i--) {
          const c = messages[i]["content"];
          if (typeof c === "string" && messages[i]["role"] !== "system") {
            return c;
          }
        }
        const content = messages[0]["content"];
        if (typeof content === "string") return content;
      }
      return text;
    } catch {
      return text;
    }
  };
}
async function benchmarkEngines(corpus, engineIds) {
  const reports = {};
  for (const id of engineIds) {
    const compress = engineToCompressFn(id);
    reports[id] = await runCompressionEval(corpus, compress);
  }
  return reports;
}
function compareReports(reports) {
  const rows = Object.entries(reports).map(([engine, report]) => ({
    engine,
    meanSavingsPercent: report.meanSavingsPercent,
    meanRetention: report.meanRetention,
    totalCompressedTokens: report.totalCompressedTokens
  }));
  rows.sort((a, b) => {
    if (b.meanSavingsPercent !== a.meanSavingsPercent) {
      return b.meanSavingsPercent - a.meanSavingsPercent;
    }
    return b.meanRetention - a.meanRetention;
  });
  return rows;
}
function runBenchmarkGate(reports, baselines, tolerancePercent = 2) {
  return Object.entries(reports).map(([engine, report]) => {
    const baseline = baselines[engine];
    if (!baseline) {
      return {
        engine,
        gate: { passed: true, regressions: [], tolerancePercent }
      };
    }
    const gate = checkTokensPerTaskGate(report, baseline, tolerancePercent);
    return { engine, gate };
  });
}
const DEFAULT_BENCHMARK_ENGINES = [
  "lite",
  "caveman",
  "aggressive",
  "ultra",
  "rtk",
  "session-dedup",
  "headroom",
  "ccr"
];
function formatBenchmarkTable(rows) {
  const header = "| Engine | Mean Savings % | Mean Retention | Total Compressed Tokens |";
  const sep = "| --- | ---: | ---: | ---: |";
  const body = rows.map((r, i) => {
    const engine = i === 0 ? `**${r.engine}**` : r.engine;
    return `| ${engine} | ${r.meanSavingsPercent.toFixed(1)} | ${r.meanRetention.toFixed(3)} | ${r.totalCompressedTokens} |`;
  });
  return [header, sep, ...body].join("\n");
}
export {
  BENCHMARK_CORPUS,
  DEFAULT_BENCHMARK_ENGINES,
  benchmarkEngines,
  compareReports,
  engineToCompressFn,
  formatBenchmarkTable,
  runBenchmarkGate
};
