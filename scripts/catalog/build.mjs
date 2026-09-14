// Выгружает каталог магазина очков Steam в apps/web/public/catalog.
// Раз в сутки его запускает GitHub Actions, руками: node scripts/catalog/build.mjs
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'apps/web/public/catalog')
const API = 'https://api.steampowered.com'
const PAGE = 1000
const SHARD = 5000
const APPS_BATCH = 200

const KINDS = [
  { name: 'backgrounds', cls: 3 },
  { name: 'mini', cls: 13 },
  { name: 'frames', cls: 14 },
  { name: 'avatars', cls: 15 },
  { name: 'profiles', cls: 8 },
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function getJson(url, tries = 5) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) }).catch(() => null)
    if (res?.ok) return res.json()
    if (attempt >= tries) throw new Error(`${res?.status ?? 'network error'} ${url.slice(0, 120)}`)
    await sleep(2000 * attempt)
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

async function fetchKind(cls) {
  const items = []
  let cursor = ''
  let total = 0
  for (let page = 0; page < 200; page++) {
    const params = new URLSearchParams({ count: String(PAGE), 'community_item_classes[0]': String(cls) })
    if (cursor) params.set('cursor', cursor)
    const { response } = await getJson(`${API}/ILoyaltyRewardsService/QueryRewardItems/v1/?${params}`)
    const defs = response?.definitions ?? []
    total = response?.total_count ?? total
    items.push(...defs)
    const next = response?.next_cursor
    if (!defs.length || !next || next === cursor || items.length >= total) break
    cursor = next
  }
  return { items, total }
}

// Короткие ключи, чтобы файлы весили меньше:
// d — id предмета, a — appid игры, n — название, p — цена в очках, t — дата появления,
// i — большая картинка, s — маленькая (у рамок и аватаров она анимированная),
// w, m — видео webm и mp4, an — анимированный, th — тема профиля.
// Уменьшенные версии видео у Steam сейчас совпадают с обычными, их не храним
function trim(def) {
  const data = def.community_item_data ?? {}
  const item = {
    d: def.defid,
    a: def.appid,
    n: data.item_title || data.item_name || '',
    p: Number(def.point_cost) || 0,
    t: def.timestamp_created ?? 0,
    i: data.item_image_large,
  }
  if (data.item_image_small) item.s = data.item_image_small
  if (data.item_movie_webm) item.w = data.item_movie_webm
  if (data.item_movie_mp4) item.m = data.item_movie_mp4
  if (data.animated) item.an = 1
  if (data.profile_theme_id) item.th = data.profile_theme_id
  return item
}

// Метки контента Steam: 3 — только для взрослых, 4 — частая нагота.
// Такие игры Steam сам прячет в магазине, мы прячем их предметы в каталоге
const ADULT_DESCRIPTORS = [3, 4]

async function fetchAppInfo(appids) {
  const names = {}
  const adult = new Set()
  for (let i = 0; i < appids.length; i += APPS_BATCH) {
    const ids = appids.slice(i, i + APPS_BATCH).map((appid) => ({ appid: Number(appid) }))
    const input = { ids, context: { language: 'english', country_code: 'US' }, data_request: {} }
    const { response } = await getJson(
      `${API}/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`,
    )
    for (const it of response?.store_items ?? []) {
      const id = String(it.appid ?? it.id)
      if (it.success === 1 && it.name) names[id] = it.name
      if ((it.content_descriptorids ?? []).some((d) => ADULT_DESCRIPTORS.includes(d))) adult.add(id)
    }
  }
  return { names, adult }
}

const previous = await readJson(path.join(OUT, 'index.json'))
const previousApps = await readJson(path.join(OUT, 'apps.json'))
const knownApps = previousApps?.names ?? {}
const knownAdult = new Set((previousApps?.adult ?? []).map(String))
const files = {}
const kinds = {}
const appids = new Set()

for (const { name, cls } of KINDS) {
  const { items, total } = await fetchKind(cls)
  const byId = new Map()
  for (const def of items) {
    if (def.active === false || !def.community_item_data?.item_image_large) continue
    byId.set(def.defid, trim(def))
  }
  // по возрастанию id: новые предметы дописываются в последний файл, остальные не меняются
  const list = [...byId.values()].sort((a, b) => a.d - b.d)

  if (list.length < total * 0.9) throw new Error(`${name}: пришло ${list.length} из ${total}`)
  const before = previous?.kinds?.[name]?.total
  if (before && list.length < before * 0.9) throw new Error(`${name}: было ${before}, стало ${list.length}`)

  const shards = []
  for (let start = 0; start < list.length; start += SHARD) {
    const file = `${name}-${shards.length}.json`
    files[file] = JSON.stringify(list.slice(start, start + SHARD))
    shards.push(file)
  }
  kinds[name] = { total: list.length, shards }
  for (const item of list) appids.add(String(item.a))
  console.log(`${name}: ${list.length}`)
}

const missing = [...appids].filter((id) => !knownApps[id])
const fresh = await fetchAppInfo(missing)
const names = {}
const adult = []
for (const id of [...appids].sort((a, b) => Number(a) - Number(b))) {
  const title = knownApps[id] ?? fresh.names[id]
  if (title) names[id] = title
  if (knownAdult.has(id) || fresh.adult.has(id)) adult.push(Number(id))
}
files['apps.json'] = JSON.stringify({ names, adult })
console.log(`игры: ${Object.keys(names).length} из ${appids.size}, для взрослых ${adult.length}, запросили ${missing.length}`)

const hash = createHash('sha1')
for (const file of Object.keys(files).sort()) hash.update(file).update(files[file])
const version = hash.digest('hex').slice(0, 12)

if (previous?.version === version) {
  console.log('каталог не изменился')
  process.exit(0)
}

await mkdir(OUT, { recursive: true })
for (const file of await readdir(OUT)) {
  if (file.endsWith('.json') && file !== 'index.json' && !(file in files)) await rm(path.join(OUT, file))
}
for (const [file, body] of Object.entries(files)) await writeFile(path.join(OUT, file), body)
await writeFile(path.join(OUT, 'index.json'), JSON.stringify({ version, kinds }, null, 1) + '\n')
console.log(`готово, версия ${version}`)
