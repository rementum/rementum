import { getDictionary, template } from "./i18n/get-dictionary";
import { INTL_LOCALE, type Locale } from "./i18n/locales";

const dateFormats = new Map<Locale, Intl.DateTimeFormat>();
const dateTimeFormats = new Map<Locale, Intl.DateTimeFormat>();

function dateFormat(locale: Locale = "en") {
  let format = dateFormats.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: "medium" });
    dateFormats.set(locale, format);
  }
  return format;
}

function dateTimeFormat(locale: Locale = "en") {
  let format = dateTimeFormats.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
      dateStyle: "medium",
      timeStyle: "short",
    });
    dateTimeFormats.set(locale, format);
  }
  return format;
}

// Locale-aware relative time. Callers outside the localized homepage /
// dashboard keep the default, so their output is unchanged English.
export function relativeTime(value: string, locale: Locale = "en") {
  const elapsed = Date.now() - new Date(value).getTime();
  // Clock skew can date a row in the future; "just now" beats "-3m ago".
  if (elapsed < 0) return getDictionary(locale).time.justNow;
  const strings = getDictionary(locale).time;
  const minutes = Math.round(elapsed / 60000);
  if (minutes < 1) return strings.justNow;
  if (minutes < 60) return template(strings.minutesAgo, { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return template(strings.hoursAgo, { count: hours });
  const days = Math.round(hours / 24);
  if (days < 14) return template(strings.daysAgo, { count: days });
  return dateFormat(locale).format(new Date(value));
}

export function formatDate(value: string, locale: Locale = "en") {
  return dateFormat(locale).format(new Date(value));
}

export function formatDateTime(value: string, locale: Locale = "en") {
  return dateTimeFormat(locale).format(new Date(value));
}
