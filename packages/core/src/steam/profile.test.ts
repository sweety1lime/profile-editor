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

const xmlProfile = (privacy = 'public') => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><profile>
	<steamID64>${ID}</steamID64>
	<steamID><![CDATA[Rabscuttle]]></steamID>
	<privacyState>${privacy}</privacyState>
	<avatarFull><![CDATA[https://avatars.fastly.steamstatic.com/abc_full.jpg]]></avatarFull>
</profile>`

const XML_NOT_FOUND = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><response><error><![CDATA[The specified profile could not be found.]]></error></response>`

function fakeSteam(routes: Record<string, unknown>) {
  const calls: string[] = []
  const fetchFn = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    calls.push(url.pathname)
    const body = routes[url.pathname]
    if (body === undefined) return new Response('', { status: 500 })
    if (typeof body === 'number') return new Response('', { status: body })
    if (typeof body === 'string') return new Response(body, { headers: { 'Content-Type': 'text/xml' } })
    return Response.json(body)
  }) as typeof fetch
  return { fetchFn, calls }
}

const fullProfile = (privacy = 'public'): Record<string, unknown> => ({
  [`/profiles/${ID}/`]: xmlProfile(privacy),
  '/id/rabscuttle/': xmlProfile(privacy),
  '/miniprofile/22202/json/': { level: 42, persona_name: 'Rabscuttle', avatar_url: 'https://a/mini.jpg' },
  '/IPlayerService/GetProfileItemsEquipped/v1/': ITEMS,
  '/IPlayerService/GetProfileCustomization/v1/': { response: { profile_theme: { theme_id: 'Midnight' } } },
})

const req = (id: string, method = 'GET') =>
  new Request(`https://example.test/api/steam/profile?id=${encodeURIComponent(id)}`, { method })

describe('handleProfileRequest', () => {
  it('collects a public profile by SteamID64', async () => {
    const { fetchFn } = fakeSteam(fullProfile())
    const res = await handleProfileRequest(req(ID), { fetch: fetchFn })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      steamid: ID,
      name: 'Rabscuttle',
      avatar: 'https://avatars.fastly.steamstatic.com/abc_full.jpg',
      profileUrl: `https://steamcommunity.com/profiles/${ID}/`,
      isPublic: true,
      level: 42,
      theme: 'Midnight',
    })
    expect(body.background).toEqual({
      name: 'Neon City',
      image: `${CDN}items/2196160/bg.jpg`,
      webm: `${CDN}items/2196160/bg.webm`,
      mp4: `${CDN}items/2196160/bg.mp4`,
    })
    expect(body.avatarFrame.imageSmall).toBe(`${CDN}items/1/frame_anim.png`)
    expect(body.miniProfile).toBeUndefined()
    expect(res.headers.get('Vercel-CDN-Cache-Control')).toContain('s-maxage')
  })

  it('resolves a short link through the profile xml', async () => {
    const { fetchFn, calls } = fakeSteam(fullProfile())
    const res = await handleProfileRequest(req('https://steamcommunity.com/id/rabscuttle/'), { fetch: fetchFn })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.steamid).toBe(ID)
    expect(calls[0]).toBe('/id/rabscuttle/')
  })

  it('hides the level of a private profile', async () => {
    const { fetchFn } = fakeSteam(fullProfile('friendsonly'))
    const body = await (await handleProfileRequest(req(ID), { fetch: fetchFn })).json()
    expect(body.isPublic).toBe(false)
    expect(body.level).toBeUndefined()
  })

  it('returns 404 for an unknown name', async () => {
    const { fetchFn } = fakeSteam({ '/id/nobody/': XML_NOT_FOUND })
    const res = await handleProfileRequest(req('nobody'), { fetch: fetchFn })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })

  it('still answers when steamcommunity is down but the api works', async () => {
    const routes = fullProfile()
    delete routes[`/profiles/${ID}/`]
    delete routes['/miniprofile/22202/json/']
    const { fetchFn } = fakeSteam(routes)
    const res = await handleProfileRequest(req(ID), { fetch: fetchFn })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.name).toBeUndefined()
    expect(body.background.image).toBe(`${CDN}items/2196160/bg.jpg`)
  })

  it('rejects bad input and other methods', async () => {
    expect((await handleProfileRequest(req('not valid!'))).status).toBe(400)
    expect((await handleProfileRequest(req(ID, 'POST'))).status).toBe(405)
  })

  it('passes 429 through and does not cache errors', async () => {
    const { fetchFn } = fakeSteam({
      [`/profiles/${ID}/`]: 429,
      '/miniprofile/22202/json/': 429,
      '/IPlayerService/GetProfileItemsEquipped/v1/': 429,
      '/IPlayerService/GetProfileCustomization/v1/': 429,
    })
    const res = await handleProfileRequest(req(ID), { fetch: fetchFn })
    expect(res.status).toBe(429)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})
