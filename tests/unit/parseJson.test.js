import { describe, it, expect } from "vitest";
import { parseJson } from "../../src/lib/utils/parseJson.js";

describe("parseJson", () => {
  it("returns parsed JSON when body is valid", async () => {
    const request = { json: async () => ({ key: "value" }) };
    await expect(parseJson(request)).resolves.toEqual({ key: "value" });
  });

  it("throws a normalized error when body is malformed", async () => {
    const request = { json: async () => { throw new SyntaxError("Unexpected token"); } };
    await expect(parseJson(request)).rejects.toThrow("Invalid JSON payload");
  });

  it("rejects when json() itself fails", async () => {
    const request = { json: async () => { throw new Error("network failure"); } };
    await expect(parseJson(request)).rejects.toThrow("Invalid JSON payload");
  });
});
