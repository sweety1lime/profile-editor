// Размеры витрин в пикселях, как они выглядят на странице профиля.
// Сверено замером живых профилей, см. layout.ts

export type ShowcaseKind = 'artwork' | 'featured' | 'screenshot' | 'workshop'

export interface Slice {
  id: string
  x: number
  width: number
}

export interface Showcase {
  kind: ShowcaseKind
  width: number
  slices: Slice[]
  // если файл надо сохранять шире, чем он показывается
  exportWidth?: number
}

const artworkSlices: Slice[] = [
  { id: 'main', x: 0, width: 506 },
  { id: 'side', x: 515, width: 100 },
]

// 632 px внутренней ширины делятся на 5 колонок, у картинки по 2 px отступа с каждой стороны
const WORKSHOP_COLUMN = 126.4
const WORKSHOP_MARGIN = 2

const round1 = (n: number) => Math.round(n * 10) / 10

export const SHOWCASES: Record<ShowcaseKind, Showcase> = {
  artwork: { kind: 'artwork', width: 615, slices: artworkSlices },
  screenshot: { kind: 'screenshot', width: 615, slices: artworkSlices },
  featured: { kind: 'featured', width: 630, slices: [{ id: 'main', x: 0, width: 630 }] },
  workshop: {
    kind: 'workshop',
    width: round1(WORKSHOP_COLUMN * 5 - WORKSHOP_MARGIN * 2),
    exportWidth: 150,
    slices: Array.from({ length: 5 }, (_, i) => ({
      id: String(i + 1),
      x: round1(WORKSHOP_COLUMN * i),
      width: round1(WORKSHOP_COLUMN - WORKSHOP_MARGIN * 2),
    })),
  },
}

// У иллюстраций и скриншотов справа колонка, под которой Steam ставит плашку «+N»,
// когда работ больше, чем влезло в витрину
export const hasCounter = (kind: ShowcaseKind) => kind === 'artwork' || kind === 'screenshot'

// Между частями витрины в профиле остаётся зазор: всё, что на него попало, окажется разрезанным.
// У избранной иллюстрации часть одна, поэтому зазоров нет вовсе
export function sliceGaps(kind: ShowcaseKind): { start: number; end: number }[] {
  const { slices } = SHOWCASES[kind]
  const gaps: { start: number; end: number }[] = []
  for (let i = 1; i < slices.length; i++) {
    const start = slices[i - 1]!.x + slices[i - 1]!.width
    const end = slices[i]!.x
    if (end > start) gaps.push({ start, end })
  }
  return gaps
}

// Фоны профиля шириной 1920 px. В режиме «Original Size» фон стоит по центру страницы без масштабирования
export const PROFILE_BACKGROUND_WIDTH = 1920

// Steam пишет про 5 МБ, берём с небольшим запасом
export const UPLOAD_LIMIT_BYTES = 4_950_000

export const UPLOAD_PAGE = 'https://steamcommunity.com/sharedfiles/edititem/767/3/'

const LONG_IMAGE = "$J('#image_width').val(1000).attr('id',''),$J('#image_height').val(1).attr('id','')"

export const UPLOAD_SNIPPETS: Record<ShowcaseKind, string> = {
  artwork: `${LONG_IMAGE};`,
  featured: `${LONG_IMAGE};`,
  screenshot: `${LONG_IMAGE},$J('[name=file_type]').val(5);`,
  workshop: "$J('[name=consumer_app_id]').val(480);$J('[name=file_type]').val(0);$J('[name=visibility]').val(0);",
}
