import { parseProfileRef, type ProfileRef } from './input'

const API = 'https://api.steampowered.com'
const ASSETS = 'https://shared.fastly.steamstatic.com/community_assets/images/'
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
  profileUrl?: string
  level?: number
  isPublic?: boolean
  theme?: string
  background?: ItemMedia
  miniProfile?: ItemMedia
  avatarFrame?: ItemMedia
  animatedAvatar?: ItemMedia
}

export interface SteamEnv {
  apiKey?: string
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

interface SummaryResponse {
  response?: {
    players?: {
      personaname?: string
      avatarfull?: string
      profileurl?: string
      communityvisibilitystate?: number
    }[]
  }
}

interface LevelResponse {
  response?: { player_level?: number }
}

interface VanityResponse {
  response?: { success?: number; steamid?: string }
}

async function call<T>(env: SteamEnv, path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(path, API)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  const res = await (env.fetch ?? fetch)(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new SteamError(res.status === 429 ? 429 : 502, 'steam_unavailable')
  return (await res.json()) as T
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

async function resolveSteamId(ref: ProfileRef, env: SteamEnv): Promise<string> {
  if (ref.type === 'id') return ref.steamid
  if (!env.apiKey) throw new SteamError(400, 'vanity_needs_key')
  const data = await call<VanityResponse>(env, '/ISteamUser/ResolveVanityURL/v1/', {
    key: env.apiKey,
    vanityurl: ref.vanity,
  })
  if (data.response?.success !== 1 || !data.response.steamid) throw new SteamError(404, 'not_found')
  return data.response.steamid
}

export async function fetchProfile(ref: ProfileRef, env: SteamEnv = {}): Promise<ProfileData> {
  const steamid = await resolveSteamId(ref, env)
  const key = env.apiKey

  // предметы и тема отдаются без ключа, ник, аватар и уровень только с ключом
  const [items, custom, summary, level] = await Promise.allSettled([
    call<ItemsResponse>(env, '/IPlayerService/GetProfileItemsEquipped/v1/', { steamid }),
    call<CustomizationResponse>(env, '/IPlayerService/GetProfileCustomization/v1/', { steamid }),
    key ? call<SummaryResponse>(env, '/ISteamUser/GetPlayerSummaries/v2/', { key, steamids: steamid }) : undefined,
    key ? call<LevelResponse>(env, '/IPlayerService/GetSteamLevel/v1/', { key, steamid }) : undefined,
  ])

  const player = summary.status === 'fulfilled' ? summary.value?.response?.players?.[0] : undefined
  if (items.status === 'rejected' && !player) throw items.reason
  if (key && summary.status === 'fulfilled' && !player) throw new SteamError(404, 'not_found')

  const equipped = items.status === 'fulfilled' ? (items.value.response ?? {}) : {}
  const theme = custom.status === 'fulfilled' ? custom.value.response?.profile_theme?.theme_id : undefined

  return {
    steamid,
    name: player?.personaname,
    avatar: player?.avatarfull,
    profileUrl: player?.profileurl,
    isPublic: player ? player.communityvisibilitystate === 3 : undefined,
    level: level.status === 'fulfilled' ? level.value?.response?.player_level : undefined,
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
