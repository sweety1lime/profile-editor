import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ru from './locales/ru.json'
import en from './locales/en.json'

export const LANGS = ['ru', 'en'] as const
export type Lang = (typeof LANGS)[number]

export const isLang = (value: string | undefined): value is Lang => LANGS.includes(value as Lang)

export function detectLang(): Lang {
  return navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en'
}

const fromPath = window.location.pathname.split('/')[1]

i18n.use(initReactI18next).init({
  resources: { ru: { translation: ru }, en: { translation: en } },
  lng: isLang(fromPath) ? fromPath : detectLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
