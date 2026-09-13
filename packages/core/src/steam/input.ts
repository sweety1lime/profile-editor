export type ProfileRef = { type: 'id'; steamid: string } | { type: 'vanity'; vanity: string }

const STEAMID = /^7656119\d{10}$/
const VANITY = /^[A-Za-z0-9_-]{2,32}$/

// Понимает SteamID64, ссылки вида /profiles/<id> и /id/<ник>, а также просто ник из ссылки
export function parseProfileRef(raw: string): ProfileRef | null {
  const value = raw.trim().replace(/\/+$/, '')

  if (STEAMID.test(value)) return { type: 'id', steamid: value }

  const url = value.match(/steamcommunity\.com\/(profiles|id)\/([^/?#]+)/i)
  if (url) {
    const kind = url[1]!.toLowerCase()
    const part = url[2]!
    if (kind === 'profiles') return STEAMID.test(part) ? { type: 'id', steamid: part } : null
    return VANITY.test(part) ? { type: 'vanity', vanity: part } : null
  }

  if (VANITY.test(value)) return { type: 'vanity', vanity: value }
  return null
}
