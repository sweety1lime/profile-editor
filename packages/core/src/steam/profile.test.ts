import { describe, expect, it } from 'vitest'
import { handleProfileRequest } from './profile'

const ID = '76561197960287930'
const CDN = 'https://shared.fastly.steamstatic.com/community_assets/images/'

const ITEMS = {
  response: {
    profile_background: {
      item_title: 'Neon City',
      image_large: 'items/2196160/bg.jpg',
      movie_webm: 'items/2196160/bg.webm',
      movie_mp4: 'items/2196160/bg.mp4',
    },
    avatar_frame: { image_large: 'items/1/frame.png', image_small: 'items/1/frame_anim.png' },
    mini_profile_background: {},
  },
}

function fakeSteam(routes: Record<string, unknown>) {
  const calls: string[] = []
  const fetchFn = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    calls.push(url.pathname)
    const body = routes[url.pathname]
    if (body === undefined) return new Response('', { status: 500 })
    if (typeof body === 'number') return new Response('', { status: body })
    return Response.json(body)
  }) as typeof fetch
  return { fetchFn, calls }
}

const req = (id: string, method = 'GET') =>
  new Request(`https://example.test/api/steam/profile?id=${encodeURIComponent(id)}`, { method })

describe('handleProfileRequest', () => {
  it('works without a key: items and theme only', async () => {
    const { fetchFn, calls } = fakeSteam({
      '/IPlayerService/GetProfileItemsEquipped/v1/': ITEMS,
      '/IPlayerService/GetProfileCustomization/v1/': { response: { profile_theme: { theme_id: 'Midnight' } } },
    })
    const res = await handleProfileRequest(req(ID), { fetch: fetchFn })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.steamid).toBe(ID)
    expect(body.theme).toBe('Midnight')
    expect(body.name).toBeUndefined()
    expect(body.background).toEqual({
      name: 'Neon City',
      image: `${CDN}items/2196160/bg.jpg`,
      webm: `${CDN}items/2196160/bg.webm`,
      mp4: `${CDN}items/2196160/bg.mp4`,
    })
    expect(body.avatarFrame.imageSmall).toBe(`${CDN}items/1/frame_anim.png`)
    expect(body.miniProfile).toBeUndefined()
    expect(calls).not.toContain('/ISteamUser/GetPlayerSummaries/v2/')
    expect(res.headers.get('Vercel-CDN-Cache-Control')).toContain('s-maxage')
  })

  it('with a key resolves vanity names and adds name, avatar, level', async () => {
    const { fetchFn } = fakeSteam({
      '/ISteamUser/ResolveVanityURL/v1/': { response: { success: 1, steamid: ID } },
      '/IPlayerService/GetProfileItemsEquipped/v1/': ITEMS,
      '/IPlayerService/GetProfileCustomization/v1/': { response: {} },
      '/ISteamUser/GetPlayerSummaries/v2/': {
        response: { players: [{ personaname: 'Rabscuttle', avatarfull: 'https://a/b.jpg', communityvisibilitystate: 3 }] },
      },
      '/IPlayerService/GetSteamLevel/v1/': { response: { player_level: 42 } },
    })
    const res = await handleProfileRequest(req('https://steamcommunity.com/id/rabscuttle'), {
      apiKey: 'k',
      fetch: fetchFn,
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ steamid: ID, name: 'Rabscuttle', level: 42, isPublic: true })
    expect(body.theme).toBeUndefined()
  })

  it('asks for SteamID64 when there is no key', async () => {
    const res = await handleProfileRequest(req('somebody'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'vanity_needs_key' })
  })

  it('rejects bad input and other methods', async () => {
    expect((await handleProfileRequest(req('not valid!'))).status).toBe(400)
    expect((await handleProfileRequest(req(ID, 'POST'))).status).toBe(405)
  })

  it('returns 404 when the vanity name does not exist', async () => {
    const { fetchFn } = fakeSteam({ '/ISteamUser/ResolveVanityURL/v1/': { response: { success: 42 } } })
    const res = await handleProfileRequest(req('nobody'), { apiKey: 'k', fetch: fetchFn })
    expect(res.status).toBe(404)
  })

  it('passes 429 through and does not cache errors', async () => {
    const { fetchFn } = fakeSteam({
      '/IPlayerService/GetProfileItemsEquipped/v1/': 429,
      '/IPlayerService/GetProfileCustomization/v1/': 429,
    })
    const res = await handleProfileRequest(req(ID), { fetch: fetchFn })
    expect(res.status).toBe(429)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})
