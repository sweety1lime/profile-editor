import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ru from './locales/ru.json'
import en from './locales/en.json'
import { detectLang, isLang } from './lib/langs'

export { LANGS, detectLang, isLang, type Lang } from './lib/langs'

const fromPath = window.location.pathname.split('/')[1]

i18n.use(initReactI18next).init({
  resources: { ru: { translation: ru }, en: { translation: en } },
  lng: isLang(fromPath) ? fromPath : detectLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
