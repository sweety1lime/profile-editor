import { describe, expect, it } from 'vitest'
import { parseProfileRef } from './input'

describe('parseProfileRef', () => {
  it('accepts a plain SteamID64', () => {
    expect(parseProfileRef('76561197960287930')).toEqual({ type: 'id', steamid: '76561197960287930' })
  })

  it('accepts profile links', () => {
    expect(parseProfileRef('https://steamcommunity.com/profiles/76561197960287930/')).toEqual({
      type: 'id',
      steamid: '76561197960287930',
    })
    expect(parseProfileRef('steamcommunity.com/id/gabelogannewell')).toEqual({
      type: 'vanity',
      vanity: 'gabelogannewell',
    })
  })

  it('accepts a bare vanity name', () => {
    expect(parseProfileRef('  some_name-1 ')).toEqual({ type: 'vanity', vanity: 'some_name-1' })
  })

  it('rejects garbage', () => {
    expect(parseProfileRef('')).toBeNull()
    expect(parseProfileRef('a')).toBeNull()
    expect(parseProfileRef('https://steamcommunity.com/profiles/123')).toBeNull()
    expect(parseProfileRef('name with spaces')).toBeNull()
    expect(parseProfileRef('https://example.com/<script>')).toBeNull()
  })
})
