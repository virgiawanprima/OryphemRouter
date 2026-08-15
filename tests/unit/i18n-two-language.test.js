import { describe, it, expect } from "vitest";
import { LOCALES, DEFAULT_LOCALE, normalizeLocale, isSupportedLocale, LOCALE_NAMES } from "../../src/i18n/config.js";

describe("i18n 2-Language Support", () => {
  it("supports exactly 2 languages: en and id", () => {
    expect(LOCALES).toEqual(["en", "id"]);
    expect(LOCALES).toHaveLength(2);
  });

  it("defaults to English", () => {
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("has English and Indonesia names", () => {
    expect(LOCALE_NAMES.en).toBe("English");
    expect(LOCALE_NAMES.id).toBe("Indonesia");
  });

  it("normalizes valid locales", () => {
    expect(normalizeLocale("en")).toBe("en");
    expect(normalizeLocale("id")).toBe("id");
    expect(normalizeLocale("id-ID")).toBe("id");
    expect(normalizeLocale("in")).toBe("id");
  });

  it("falls back to English for unsupported locales", () => {
    expect(normalizeLocale("vi")).toBe("en");
    expect(normalizeLocale("zh-CN")).toBe("en");
    expect(normalizeLocale("ja")).toBe("en");
    expect(normalizeLocale("fr")).toBe("en");
    expect(normalizeLocale("de")).toBe("en");
    expect(normalizeLocale(undefined)).toBe("en");
    expect(normalizeLocale(null)).toBe("en");
  });

  it("validates supported locales", () => {
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("id")).toBe(true);
    expect(isSupportedLocale("vi")).toBe(false);
    expect(isSupportedLocale("zh-CN")).toBe(false);
  });
});