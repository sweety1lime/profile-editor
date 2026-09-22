// Языки сайта. Лежат отдельно от i18n.ts: тот при импорте поднимает i18next и читает адрес страницы,
// а эти константы нужны и там, где ничего поднимать не надо

export const LANGS = ['ru', 'en'] as const

export type Lang = (typeof LANGS)[number]

export const isLang = (value: string | undefined): value is Lang => LANGS.includes(value as Lang)

export function detectLang(): Lang {
  return navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en'
}
