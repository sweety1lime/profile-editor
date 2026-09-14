import { UPLOAD_LIMIT_BYTES, UPLOAD_MODES, isGif, patchGifTrailer, type UploadMode } from '@profile-editor/core'

// Панель на странице загрузки иллюстрации Steam: выбираешь витрину, выбираешь файл,
// а поля выставляются сами, как если бы код вставили в консоль

const MODES: UploadMode[] = ['artwork', 'featured', 'screenshot', 'workshop', 'guide']
const STORAGE_KEY = 'profile-editor:upload-mode'
// Steam может заполнить размеры картинки не сразу, поэтому ставим значения ещё несколько раз
const REAPPLY_MS = [0, 300, 1000, 2500]

const ru = (document.documentElement.lang || navigator.language).toLowerCase().startsWith('ru')
const TEXT = ru
  ? {
      modes: { artwork: 'Иллюстрация', featured: 'Избранная', screenshot: 'Скриншот', workshop: 'Мастерская', guide: 'Гайд' },
      pick: 'Выбери витрину, потом файл. Коды подставятся сами.',
      ready: 'Готово, можно сохранять.',
      hex: 'Гифке сделан hex-патч.',
      big: 'Файл больше 5 МБ, Steam может его не принять.',
      missing: 'Не нашёл на странице поля: {list}. Похоже, Steam поменял страницу, возьми код из инструкции.',
      noInput: 'Не нашёл на странице выбор файла.',
    }
  : {
      modes: { artwork: 'Artwork', featured: 'Featured', screenshot: 'Screenshot', workshop: 'Workshop', guide: 'Guide' },
      pick: 'Pick the showcase, then the file. The codes are filled in for you.',
      ready: 'Done, you can save now.',
      hex: 'The GIF got the hex patch.',
      big: 'The file is over 5 MB, Steam may reject it.',
      missing: "Couldn't find these fields: {list}. Steam probably changed the page, use the code from the guide.",
      noInput: "Couldn't find the file picker on the page.",
    }

function loadMode(): UploadMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as UploadMode | null
    return saved && MODES.includes(saved) ? saved : 'artwork'
  } catch {
    return 'artwork'
  }
}

let mode = loadMode()
let notes: { text: string; warn?: boolean }[] = [{ text: TEXT.pick }]

// Поля ищем один раз: после первой подстановки у части из них уже не будет id
const found = new Map<string, HTMLInputElement | null>()
const originals = new Map<HTMLInputElement, string>()
const detached = new Map<HTMLInputElement, string>()
// настоящие размеры выбранной картинки, их страница записала бы сама
let imageSize: { width: number; height: number } | null = null

function field(selector: string): HTMLInputElement | null {
  if (!found.has(selector)) found.set(selector, document.querySelector<HTMLInputElement>(selector))
  return found.get(selector) ?? null
}

async function measure(file: File) {
  try {
    const bitmap = await createImageBitmap(file)
    imageSize = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
  } catch {
    imageSize = null
  }
}

function applyMode(): string[] {
  const missing: string[] = []
  const touched = new Set<HTMLInputElement>()
  for (const f of UPLOAD_MODES[mode].fields) {
    const el = field(f.selector)
    if (!el) {
      missing.push(f.selector)
      continue
    }
    if (!originals.has(el)) originals.set(el, el.value)
    el.value = f.value
    if (f.detach && el.id) {
      detached.set(el, el.id)
      el.id = ''
    }
    touched.add(el)
  }
  // поля от прошлой выбранной витрины возвращаем странице: id на место, размеры — настоящие
  for (const [el, value] of originals) {
    if (touched.has(el)) continue
    const id = detached.get(el)
    if (id) {
      el.id = id
      detached.delete(el)
    }
    if (el.name === 'image_width' && imageSize) el.value = String(imageSize.width)
    else if (el.name === 'image_height' && imageSize) el.value = String(imageSize.height)
    else el.value = value
  }
  return missing
}

const fileInput = document.querySelector<HTMLInputElement>('input[type=file]')

function scheduleApply() {
  for (const delay of REAPPLY_MS) setTimeout(applyMode, delay)
}

function fillTitle(file: File) {
  const title = document.querySelector<HTMLInputElement>('#title, input[name=title]')
  if (title && !title.value.trim()) title.value = file.name.replace(/\.[^.]+$/, '')
}

async function onFile() {
  const file = fileInput?.files?.[0]
  if (!fileInput || !file) return
  const next: typeof notes = []

  if (UPLOAD_MODES[mode].hex) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    // у уже пропатченной гифки последний байт 0x21, второй раз не трогаем
    if (isGif(bytes) && bytes[bytes.length - 1] === 0x3b) {
      const patched = new File([patchGifTrailer(bytes) as BlobPart], file.name, { type: file.type })
      const transfer = new DataTransfer()
      transfer.items.add(patched)
      fileInput.files = transfer.files
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
      return
    }
    if (isGif(bytes)) next.push({ text: TEXT.hex })
  }

  fillTitle(file)
  await measure(file)
  const missing = applyMode()
  scheduleApply()
  if (missing.length) next.push({ text: TEXT.missing.replace('{list}', missing.join(', ')), warn: true })
  if (file.size > UPLOAD_LIMIT_BYTES) next.push({ text: TEXT.big, warn: true })
  next.unshift({ text: `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB` })
  if (!missing.length) next.push({ text: TEXT.ready })
  notes = next
  render()
}

function setMode(next: UploadMode) {
  mode = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // без сохранения тоже работает
  }
  if (fileInput?.files?.length) onFile()
  else render()
}

const host = document.createElement('div')
host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647'
const shadow = host.attachShadow({ mode: 'open' })
shadow.innerHTML = `
<style>
  .panel { font: 13px/1.4 "Motiva Sans", Arial, sans-serif; color: #dcdedf; background: #171a21; border: 1px solid #2a475e;
    border-radius: 8px; padding: 12px; width: 270px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5) }
  .title { font-weight: 600; color: #fff; margin-bottom: 8px }
  .modes { display: flex; flex-wrap: wrap; gap: 4px }
  button { font: inherit; cursor: pointer; border: 1px solid #3d4450; background: #22262e; color: #c7d5e0; border-radius: 4px; padding: 4px 8px }
  button.active { border-color: #66c0f4; color: #fff; background: #1b3a52 }
  .notes { margin-top: 8px; font-size: 12px; color: #8f98a0 }
  .notes div + div { margin-top: 4px }
  .warn { color: #e7a33e }
</style>
<div class="panel">
  <div class="title">Profile Editor</div>
  <div class="modes"></div>
  <div class="notes"></div>
</div>`

const modesBox = shadow.querySelector('.modes')!
const notesBox = shadow.querySelector('.notes')!
const buttons = MODES.map((m) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = TEXT.modes[m]
  button.addEventListener('click', () => setMode(m))
  modesBox.append(button)
  return button
})

function render() {
  buttons.forEach((button, i) => button.classList.toggle('active', MODES[i] === mode))
  notesBox.replaceChildren(
    ...notes.map((note) => {
      const line = document.createElement('div')
      line.textContent = note.text
      if (note.warn) line.className = 'warn'
      return line
    }),
  )
}

document.body.append(host)
if (!fileInput) notes = [{ text: TEXT.noInput, warn: true }]
render()

fileInput?.addEventListener('change', () => {
  onFile()
})
// перед отправкой формы ставим значения ещё раз, на случай если страница успела их поменять
document.addEventListener(
  'click',
  () => {
    if (fileInput?.files?.length) applyMode()
  },
  true,
)
fileInput?.form?.addEventListener('submit', () => applyMode(), true)
