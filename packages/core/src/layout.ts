import { PROFILE_BACKGROUND_WIDTH, type ShowcaseKind } from './geometry'

// Раскладка страницы профиля Steam в окне шириной 1920 px. Замерено 24.09.2026 скриптом
// scripts/measure-profile.mjs на шести открытых профилях: он открывает профиль в браузере и меряет,
// где стоят картинки витрин. Steam время от времени меняет вёрстку — тогда перемерить и поправить здесь
export const PROFILE_LAYOUT = {
  // шапка сайта Steam, фон профиля начинается сразу под ней
  navHeight: 104,
  contentWidth: 976,
  headerHeight: 202,
  // между шапкой профиля и колонками: вместе с шапкой 224 px от верха фона
  headerGap: 22,
  columnsPadding: 12,
  // сверху колонки отступают от шапки чуть больше, чем от краёв по бокам
  columnsPaddingTop: 16,
  leftWidth: 652,
  rightWidth: 288,
  columnsGap: 12,
  showcaseGap: 12,
  showcaseHeader: 40,
} as const

// Где в блоке витрины начинается первая картинка: от левого края левой колонки и от верха блока.
// Иллюстрации и избранная: заголовок Steam у них прячет, отступ блока 15 сверху и 10 слева,
// плюс рамка картинки 1. Подложки под картинками больше нет.
// Скриншоты: заголовок 40 + отступ блока 20 + рамка 1.
// Мастерская: заголовок 40 + строка с аватаром автора 58 и поля вокруг неё по 10 + отступ блока 20
// + отступ картинки 2; слева отступ блока 10 и отступ картинки 2
export const SHOWCASE_INNER: Record<ShowcaseKind, { x: number; y: number }> = {
  artwork: { x: 11, y: 16 },
  screenshot: { x: 11, y: 61 },
  featured: { x: 11, y: 16 },
  workshop: { x: 12, y: 140 },
}

// Левый край левой колонки и верх первой витрины на фоне профиля шириной 1920 px
export const PROFILE_COLUMN_X =
  (PROFILE_BACKGROUND_WIDTH - PROFILE_LAYOUT.contentWidth) / 2 + PROFILE_LAYOUT.columnsPadding
export const PROFILE_FIRST_SHOWCASE_Y =
  PROFILE_LAYOUT.headerHeight + PROFILE_LAYOUT.headerGap + PROFILE_LAYOUT.columnsPaddingTop

const offset = (kind: ShowcaseKind) => ({
  x: PROFILE_COLUMN_X + SHOWCASE_INNER[kind].x,
  y: PROFILE_FIRST_SHOWCASE_Y + SHOWCASE_INNER[kind].y,
})

// Координаты первой картинки витрины на фоне 1920 px, если витрина стоит в профиле первой
export const PROFILE_OFFSET: Record<ShowcaseKind, { x: number; y: number }> = {
  artwork: offset('artwork'),
  screenshot: offset('screenshot'),
  featured: offset('featured'),
  workshop: offset('workshop'),
}
