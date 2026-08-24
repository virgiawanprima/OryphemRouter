import { describe, it, expect, vi } from "vitest";
import { resolveBaseUrl } from "../../open-sse/handlers/search/callers.js";

// Hermetic DNS: the hardened guard resolves hostnames and validates every record.
// Return a public IP for any hostname so "allows public" cases pass without
// hitting the real network (IP-literal rejects skip DNS entirely).
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

const CONFIG = { id: "searxng", baseUrl: "https://searxng.example.com" };

describe("resolveBaseUrl SSRF guard", () => {
  it("uses provider default when no override", async () => {
    expect(await resolveBaseUrl(CONFIG, {})).toBe("https://searxng.example.com");
  });

  it("allows public https override", async () => {
    const params = { providerOptions: { baseUrl: "https://my-searxng.example.com" } };
    expect(await resolveBaseUrl(CONFIG, params)).toBe("https://my-searxng.example.com");
  });

  it("allows public http override", async () => {
    const params = { providerOptions: { baseUrl: "http://searxng.example.net" } };
    expect(await resolveBaseUrl(CONFIG, params)).toBe("http://searxng.example.net");
  });

  it("rejects loopback override", async () => {
    const params = { providerOptions: { baseUrl: "http://127.0.0.1:18999" } };
    await expect(resolveBaseUrl(CONFIG, params)).rejects.toThrow();
  });

  it("rejects private IP override", async () => {
    for (const ip of ["10.0.0.1", "192.168.1.1", "172.16.0.1"]) {
      const params = { providerOptions: { baseUrl: `http://${ip}` } };
      await expect(resolveBaseUrl(CONFIG, params), `should reject ${ip}`).rejects.toThrow();
    }
  });

  it("rejects localhost hostname override", async () => {
    const params = { providerOptions: { baseUrl: "http://localhost:8080" } };
    await expect(resolveBaseUrl(CONFIG, params)).rejects.toThrow();
  });

  it("rejects cloud metadata override", async () => {
    const params = { providerOptions: { baseUrl: "http://169.254.169.254/latest/meta-data" } };
    await expect(resolveBaseUrl(CONFIG, params)).rejects.toThrow();
  });

  it("rejects non-http protocols", async () => {
    for (const proto of ["file:///etc/passwd", "gopher://127.0.0.1:70", "ftp://10.0.0.1"]) {
      const params = { providerOptions: { baseUrl: proto } };
      await expect(resolveBaseUrl(CONFIG, params), `should reject ${proto}`).rejects.toThrow();
    }
  });
});
