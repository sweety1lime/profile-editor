import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAssets } from './useAssets'

// Настоящего ImageBitmap в jsdom нет, а хуку от картинки нужен только close()
function fakeBitmap() {
  const close = vi.fn()
  return { bitmap: { close } as unknown as ImageBitmap, close }
}

const file = (text: string) => new Blob([text])

describe('useAssets', () => {
  it('добавляет картинку и просит перерисовку', () => {
    const { result } = renderHook(() => useAssets())
    const { bitmap } = fakeBitmap()

    act(() => result.current.add('a', bitmap, file('a')))

    expect(result.current.bitmaps.get('a')).toBe(bitmap)
    expect(result.current.blobs.get('a')).toBeInstanceOf(Blob)
    expect(result.current.version).toBe(1)
  })

  it('забывает картинку вместе с файлом и закрывает её', () => {
    const { result } = renderHook(() => useAssets())
    const { bitmap, close } = fakeBitmap()
    act(() => result.current.add('a', bitmap, file('a')))

    act(() => result.current.forget('a', undefined))

    expect(close).toHaveBeenCalledTimes(1)
    expect(result.current.bitmaps.has('a')).toBe(false)
    expect(result.current.blobs.has('a')).toBe(false)
  })

  it('открытый проект заменяет набор, но файлы без картинок оставляет', () => {
    const { result } = renderHook(() => useAssets())
    const previous = fakeBitmap()
    act(() => result.current.add('old', previous.bitmap, file('old')))
    const decoded = fakeBitmap()

    // broken — файл, картинка которого не раскодировалась: терять его из проекта нельзя
    act(() => result.current.load(new Map([['a', decoded.bitmap]]), { a: file('a'), broken: file('broken') }))

    expect(previous.close).toHaveBeenCalledTimes(1)
    expect(result.current.bitmaps.has('old')).toBe(false)
    expect([...result.current.bitmaps.keys()]).toEqual(['a'])
    expect([...result.current.blobs.keys()]).toEqual(['a', 'broken'])
  })

  it('закрывает картинки, когда со страницы уходят', () => {
    const { result, unmount } = renderHook(() => useAssets())
    const { bitmap, close } = fakeBitmap()
    act(() => result.current.add('a', bitmap, file('a')))

    unmount()

    expect(close).toHaveBeenCalledTimes(1)
  })
})
