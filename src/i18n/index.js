"use client";

import { useState, useEffect, useCallback } from "react";
import { translate, getCurrentLocale, onLocaleChange } from "./runtime";
import { DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE, normalizeLocale, isSupportedLocale, LOCALE_NAMES } from "./config";

// React hook for translations
export function useTranslation() {
  const [locale, setLocale] = useState(() => getCurrentLocale());

  useEffect(() => {
    const unsubscribe = onLocaleChange(() => setLocale(getCurrentLocale()));
    return unsubscribe;
  }, []);

  const t = useCallback((key, fallback) => {
    return translate(key) || fallback || key;
  }, []);

  return { t, locale };
}

// Set locale and persist to cookie
export function setLocale(locale) {
  const normalized = normalizeLocale(locale);
  if (typeof document !== "undefined") {
    document.cookie = `${LOCALE_COOKIE}=${normalized};path=/;max-age=31536000`;
  }
  // Trigger runtime reload
  if (typeof window !== "undefined") {
    import("./runtime").then(({ reloadTranslations }) => reloadTranslations());
  }
}

export { DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE, normalizeLocale, isSupportedLocale, LOCALE_NAMES };
export { translate, getCurrentLocale }; // direct access