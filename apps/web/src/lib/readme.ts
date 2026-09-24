import { UPLOAD_PAGE, UPLOAD_SNIPPETS, kitFolder, type ShowcaseKind } from '@profile-editor/core'

// Записка, которая едет в архиве рядом с картинками. Для одной витрины это просто порядок
// загрузки, для комплекта — ещё и какая папка какой витриной становится

type Translate = (key: string, options?: Record<string, unknown>) => string

export function uploadReadme(t: Translate, kinds: ShowcaseKind[]): string {
  const lines: string[] = []
  if (kinds.length > 1) {
    lines.push(t('kit.readme.title'), '')
    kinds.forEach((kind, index) => {
      lines.push(t('kit.readme.folder', { folder: kitFolder(index, kind), kind: t(`cutter.kind.${kind}`) }))
    })
    lines.push('', t('kit.readme.order'), '')
  } else {
    lines.push(t('cutter.readme', { kind: t(`cutter.kind.${kinds[0] ?? 'artwork'}`) }), '')
  }

  lines.push(t('cutter.upload.step1', { url: UPLOAD_PAGE }), t('cutter.upload.step2'), t('cutter.upload.step3'), '')
  for (const kind of new Set(kinds)) {
    if (kinds.length > 1) lines.push(`${t(`cutter.kind.${kind}`)}:`)
    lines.push(UPLOAD_SNIPPETS[kind], '')
  }

  lines.push(t('cutter.upload.note'))
  if (kinds.includes('workshop')) lines.push(t('cutter.upload.workshopNote'))
  return lines.join('\n')
}
