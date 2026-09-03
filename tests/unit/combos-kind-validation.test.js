import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB-backed repo so the test only exercises kind validation and never
// writes to the real app database (vitest runs against actual dev data).
vi.mock("@/lib/localDb", () => ({
  getCombos: vi.fn(async () => []),
  createCombo: vi.fn(async (data) => ({ id: "mock-1", name: data.name, kind: data.kind, models: data.models || [] })),
  updateCombo: vi.fn(async (id, data) => ({ id, name: data.name, kind: data.kind, models: data.models || [] })),
  deleteCombo: vi.fn(async () => true),
  getComboByName: vi.fn(async () => null),
  getComboById: vi.fn(async () => null),
}));

const { POST, PUT } = await import("@/app/api/combos/route.js");
const { PUT: PUT_ID, GET: GET_ID } = await import("@/app/api/combos/[id]/route.js");

function jsonRequest(body) {
  return new Request("http://localhost/api/combos", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("combos API — kind validation (frontend/backend contract)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an unknown kind (e.g. 'chat') with 400", async () => {
    const res = await POST(jsonRequest({ name: "bad-kind", models: ["openai/gpt-4o"], kind: "chat" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid combo kind/i);
  });

  it("accepts valid kinds (llm / webSearch / webFetch / null)", async () => {
    for (const kind of ["llm", "webSearch", "webFetch", null, undefined]) {
      const res = await POST(jsonRequest({ name: `kind-${kind || "null"}`, models: [], kind }));
      // Kind validation passes for all valid kinds → no 400 from kind validation.
      if (res.status === 400) {
        const body = await res.json();
        expect(body.error).not.toMatch(/invalid combo kind/i);
      }
    }
  });
});
