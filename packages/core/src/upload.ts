import { SHOWCASES, type ShowcaseKind } from './geometry'

// Какие поля выставить на странице загрузки иллюстрации для каждой витрины.
// Те же значения, что в кодах для консоли из UPLOAD_SNIPPETS

export type UploadMode = ShowcaseKind | 'guide'

export interface UploadField {
  selector: string
  value: string
  // убрать id у поля, чтобы скрипт страницы не перезаписал значение
  detach?: boolean
}

const LONG_IMAGE: UploadField[] = [
  { selector: '#image_width', value: '1000', detach: true },
  { selector: '#image_height', value: '1', detach: true },
]

// Для какой витрины файл из нашего архива: имя начинается с неё, см. sliceFileName.
// У чужого файла витрину по имени не угадать, тогда её выбирают руками
export function kindFromFileName(name: string): ShowcaseKind | null {
  const match = /^([a-z]+)(?:[_.]|$)/i.exec(name)
  const kind = match?.[1]?.toLowerCase()
  return kind && kind in SHOWCASES ? (kind as ShowcaseKind) : null
}

export const UPLOAD_MODES: Record<UploadMode, { fields: UploadField[]; hex: boolean }> = {
  artwork: { fields: LONG_IMAGE, hex: false },
  featured: { fields: LONG_IMAGE, hex: false },
  screenshot: { fields: [...LONG_IMAGE, { selector: '[name=file_type]', value: '5' }], hex: false },
  workshop: {
    fields: [
      { selector: '[name=consumer_app_id]', value: '480' },
      { selector: '[name=file_type]', value: '0' },
      { selector: '[name=visibility]', value: '0' },
    ],
    hex: true,
  },
  guide: { fields: [...LONG_IMAGE, { selector: '[name=file_type]', value: '9' }], hex: true },
}
