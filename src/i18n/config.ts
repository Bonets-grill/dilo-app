export const locales = ['es', 'en', 'fr', 'it', 'de'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'es';

export const localeNames: Record<Locale, string> = {
  es: 'Español',
  en: 'English',
  fr: 'Français',
  it: 'Italiano',
  de: 'Deutsch',
};

export const localeFlags: Record<Locale, string> = {
  es: '🇪🇸',
  en: '🇺🇸',
  fr: '🇫🇷',
  it: '🇮🇹',
  de: '🇩🇪',
};

// Full locale → language mapping
export const localeToLanguage: Record<string, Locale> = {
  'es-ES': 'es', 'es-MX': 'es', 'es-CO': 'es', 'es-AR': 'es', 'es-CL': 'es',
  'en-US': 'en', 'en-CA': 'en', 'en-GB': 'en', 'en-AU': 'en',
  'fr-FR': 'fr', 'fr-CA': 'fr', 'fr-BE': 'fr',
  'it-IT': 'it',
  'de-DE': 'de', 'de-AT': 'de', 'de-CH': 'de',
};

// Default currency by full locale
export const currencyByLocale: Record<string, string> = {
  'es-ES': 'EUR', 'es-MX': 'MXN', 'es-CO': 'COP',
  'en-US': 'USD', 'en-CA': 'CAD', 'en-GB': 'GBP',
  'fr-FR': 'EUR', 'fr-CA': 'CAD',
  'it-IT': 'EUR',
  'de-DE': 'EUR',
};

// Default timezone by full locale
export const timezoneByLocale: Record<string, string> = {
  'es-ES': 'Europe/Madrid', 'es-MX': 'America/Mexico_City', 'es-CO': 'America/Bogota',
  'en-US': 'America/New_York', 'en-CA': 'America/Toronto',
  'fr-FR': 'Europe/Paris', 'fr-CA': 'America/Toronto',
  'it-IT': 'Europe/Rome',
  'de-DE': 'Europe/Berlin',
};

// Supported currencies for Stripe
export const supportedCurrencies = ['EUR', 'USD', 'MXN', 'COP', 'CAD'] as const;
export type SupportedCurrency = (typeof supportedCurrencies)[number];
