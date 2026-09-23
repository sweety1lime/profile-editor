import { parseProfileRef, type ProfileRef } from './input.ts'

const API = 'https://api.steampowered.com'
const COMMUNITY = 'https://steamcommunity.com'
const ASSETS = 'https://shared.fastly.steamstatic.com/community_assets/images/'
const STEAMID64_BASE = 76561197960265728n
const TIMEOUT_MS = 8000

export interface ItemMedia {
  name?: string
  image?: string
  imageSmall?: string
  webm?: string
  mp4?: string
}

export interface ProfileData {
  steamid: string
  name?: string
  avatar?: string
  profileUrl: string
  level?: number
  isPublic?: boolean
  theme?: string
  background?: ItemMedia
  miniProfile?: ItemMedia
  avatarFrame?: ItemMedia
  animatedAvatar?: ItemMedia
}

export interface SteamEnv {
  fetch?: typeof fetch
}

export class SteamError extends Error {
  status: number

  constructor(status: number, code: string) {
    super(code)
    this.status = status
  }
}

interface RawItem {
  name?: string
  item_title?: string
  image_large?: string
  image_small?: string
  movie_webm?: string
  movie_mp4?: string
}

interface ItemsResponse {
  response?: {
    profile_background?: RawItem
    mini_profile_background?: RawItem
    avatar_frame?: RawItem
    animated_avatar?: RawItem
  }
}

interface CustomizationResponse {
  response?: { profile_theme?: { theme_id?: string } }
}

interface CommunityProfile {
  steamid: string
  name?: string
  avatar?: string
  isPublic: boolean
}

interface MiniProfile {
  level?: number
  persona_name?: string
  avatar_url?: string
}

async function request(env: SteamEnv, url: URL): Promise<Response> {
  const res = await (env.fetch ?? fetch)(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new SteamError(res.status === 429 ? 429 : 502, 'steam_unavailable')
  return res
}

async function api<T>(env: SteamEnv, path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(path, API)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return (await (await request(env, url)).json()) as T
}

function xmlTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</${tag}>`))
  const value = match?.[1] ?? match?.[2]
  return value?.trim() || undefined
}

// XML-версия страницы профиля. Отдаёт SteamID64, ник, аватар и приватность, ключ не нужен
async function communityProfile(ref: ProfileRef, env: SteamEnv): Promise<CommunityProfile> {
  const path = ref.type === 'id' ? `/profiles/${ref.steamid}/` : `/id/${ref.vanity}/`
  const url = new URL(path, COMMUNITY)
  url.searchParams.set('xml', '1')
  const xml = await (await request(env, url)).text()

  if (xmlTag(xml, 'error')) throw new SteamError(404, 'not_found')
  const steamid = xmlTag(xml, 'steamID64')
  if (!steamid) throw new SteamError(502, 'steam_unavailable')

  return {
    steamid,
    name: xmlTag(xml, 'steamID'),
    avatar: xmlTag(xml, 'avatarFull'),
    isPublic: xmlTag(xml, 'privacyState') === 'public',
  }
}

// То, что Steam показывает во всплывающей карточке профиля, отсюда берём уровень
async function miniProfile(steamid: string, env: SteamEnv): Promise<MiniProfile> {
  const accountId = (BigInt(steamid) - STEAMID64_BASE).toString()
  const res = await request(env, new URL(`/miniprofile/${accountId}/json/`, COMMUNITY))
  return (await res.json()) as MiniProfile
}

// Steam отдаёт пути вида items/<appid>/<file>, достраиваем до полного адреса на CDN
function media(item: RawItem | undefined): ItemMedia | undefined {
  if (!item?.image_large) return undefined
  const full = (path?: string) => (path ? ASSETS + path : undefined)
  return {
    name: item.item_title || item.name,
    image: full(item.image_large),
    imageSmall: full(item.image_small),
    webm: full(item.movie_webm),
    mp4: full(item.movie_mp4),
  }
}

export async function fetchProfile(ref: ProfileRef, env: SteamEnv = {}): Promise<ProfileData> {
  const community = communityProfile(ref, env)
  // по короткой ссылке сначала узнаём SteamID64, по обычной грузим всё сразу
  const steamid = ref.type === 'id' ? ref.steamid : (await community).steamid

  const [profile, items, custom, mini] = await Promise.allSettled([
    community,
    api<ItemsResponse>(env, '/IPlayerService/GetProfileItemsEquipped/v1/', { steamid }),
    api<CustomizationResponse>(env, '/IPlayerService/GetProfileCustomization/v1/', { steamid }),
    miniProfile(steamid, env),
  ])

  if (profile.status === 'rejected' && profile.reason instanceof SteamError && profile.reason.status === 404) {
    throw profile.reason
  }
  if (items.status === 'rejected') throw items.reason

  const p = profile.status === 'fulfilled' ? profile.value : undefined
  const m = mini.status === 'fulfilled' ? mini.value : undefined
  const equipped = items.value.response ?? {}
  const theme = custom.status === 'fulfilled' ? custom.value.response?.profile_theme?.theme_id : undefined

  return {
    steamid,
    name: p?.name ?? m?.persona_name,
    avatar: p?.avatar ?? m?.avatar_url,
    profileUrl: `${COMMUNITY}/profiles/${steamid}/`,
    isPublic: p?.isPublic,
    // у закрытых профилей уровень всегда приходит нулём
    level: p?.isPublic === false ? undefined : m?.level,
    theme: theme || undefined,
    background: media(equipped.profile_background),
    miniProfile: media(equipped.mini_profile_background),
    avatarFrame: media(equipped.avatar_frame),
    animatedAvatar: media(equipped.animated_avatar),
  }
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  })
}

// Готовый ответ кэшируется на CDN Vercel, так что повторные запросы не доходят ни до функции, ни до Steam
const CACHE_OK = {
  'Cache-Control': 'public, max-age=60',
  'Vercel-CDN-Cache-Control': 'public, s-maxage=600, stale-while-revalidate=86400',
}

export async function handleProfileRequest(request: Request, env: SteamEnv = {}): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' })

  const ref = parseProfileRef(new URL(request.url).searchParams.get('id') ?? '')
  if (!ref) return json({ error: 'bad_input' }, 400)

  try {
    return json(await fetchProfile(ref, env), 200, CACHE_OK)
  } catch (err) {
    if (err instanceof SteamError) {
      const cache: Record<string, string> =
        err.status === 404
          ? { 'Vercel-CDN-Cache-Control': 'public, s-maxage=300' }
          : { 'Cache-Control': 'no-store' }
      return json({ error: err.message }, err.status, cache)
    }
    return json({ error: 'internal' }, 500, { 'Cache-Control': 'no-store' })
  }
}
