import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { en } from "./en.js";
import type { TranslationKey } from "./en.js";
import { fa } from "./fa.js";

export type Lang = "fa" | "en";
export type { TranslationKey };

const DICTS: Record<Lang, Record<TranslationKey, string>> = { en, fa };
const LANG_KEY = "splitpay.lang";

interface I18n {
  lang: Lang;
  /** BCP-47 locale for Intl formatting. */
  locale: string;
  dir: "rtl" | "ltr";
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18n | null>(null);

function loadLang(): Lang {
  const stored = localStorage.getItem(LANG_KEY);
  return stored === "en" ? "en" : "fa";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(loadLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    localStorage.setItem(LANG_KEY, next);
    setLangState(next);
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => {
      let text = DICTS[lang][key] ?? en[key];
      if (params) {
        for (const [name, value] of Object.entries(params)) {
          text = text.replaceAll(`{${name}}`, String(value));
        }
      }
      return text;
    },
    [lang],
  );

  const value = useMemo<I18n>(
    () => ({
      lang,
      locale: lang === "fa" ? "fa-IR" : "en-US",
      dir: lang === "fa" ? "rtl" : "ltr",
      setLang,
      t,
    }),
    [lang, setLang, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
