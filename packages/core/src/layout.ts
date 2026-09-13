import { PROFILE_BACKGROUND_WIDTH, type ShowcaseKind } from './geometry'

// Раскладка страницы профиля Steam. Замерено на живых профилях в окне шириной 1920 px
export const PROFILE_LAYOUT = {
  // шапка сайта Steam, фон профиля начинается сразу под ней
  navHeight: 104,
  contentWidth: 976,
  headerHeight: 202,
  // между шапкой профиля и колонками
  headerGap: 22,
  columnsPadding: 12,
  leftWidth: 652,
  rightWidth: 288,
  columnsGap: 12,
  showcaseGap: 12,
  showcaseHeader: 40,
} as const

// Где в витрине начинается первая картинка: от левого края левой колонки и от верха витрины.
// Иллюстрации: отступ блока 10 + подложка 8 + рамка 1, сверху шапка 40 + 20 + 8 + 1.
// Мастерская: то же, но вместо рамки у каждой части отступ 2.
// Избранная: без шапки и подложки, отступы 10 и 15 плюс рамка
export const SHOWCASE_INNER: Record<ShowcaseKind, { x: number; y: number }> = {
  artwork: { x: 19, y: 69 },
  screenshot: { x: 19, y: 69 },
  featured: { x: 11, y: 16 },
  workshop: { x: 20, y: 70 },
}

const leftColumnX = (PROFILE_BACKGROUND_WIDTH - PROFILE_LAYOUT.contentWidth) / 2 + PROFILE_LAYOUT.columnsPadding
const firstShowcaseY = PROFILE_LAYOUT.headerHeight + PROFILE_LAYOUT.headerGap + PROFILE_LAYOUT.columnsPadding

// Координаты первой картинки витрины на фоне 1920 px, если витрина стоит в профиле первой
export const PROFILE_OFFSET: Record<ShowcaseKind, { x: number; y: number }> = {
  artwork: { x: leftColumnX + SHOWCASE_INNER.artwork.x, y: firstShowcaseY + SHOWCASE_INNER.artwork.y },
  screenshot: { x: leftColumnX + SHOWCASE_INNER.screenshot.x, y: firstShowcaseY + SHOWCASE_INNER.screenshot.y },
  featured: { x: leftColumnX + SHOWCASE_INNER.featured.x, y: firstShowcaseY + SHOWCASE_INNER.featured.y },
  workshop: { x: leftColumnX + SHOWCASE_INNER.workshop.x, y: firstShowcaseY + SHOWCASE_INNER.workshop.y },
}
