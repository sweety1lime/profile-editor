import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHistory } from './useHistory'

interface Doc {
  step: number
  layers: string[]
}

const doc = (step: number, layers: string[] = []): Doc => ({ step, layers })

function setup(initial: Doc) {
  const view = renderHook((state: Doc) => useHistory(state, { delay: 100, limit: 3 }), { initialProps: initial })

  // как в конструкторе: вернувшееся состояние сразу раскладывается обратно на холст
  const undo = () => {
    let restored: Doc | null = null
    act(() => {
      restored = view.result.current.undo()
    })
    if (restored) view.rerender(restored)
    return restored as Doc | null
  }
  const redo = () => {
    let restored: Doc | null = null
    act(() => {
      restored = view.result.current.redo()
    })
    if (restored) view.rerender(restored)
    return restored as Doc | null
  }
  const wait = (ms = 200) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))
  return { ...view, undo, redo, wait }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useHistory', () => {
  it('на пустом месте возвращаться некуда', () => {
    const { result } = setup(doc(1))

    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
    expect(result.current.undo()).toBeNull()
    expect(result.current.redo()).toBeNull()
  })

  it('возвращает состояние до правки', async () => {
    const start = doc(1)
    const { result, rerender, undo, wait } = setup(start)

    rerender(doc(2))
    await wait()
    expect(result.current.canUndo).toBe(true)

    expect(undo()).toBe(start)
    expect(result.current.canUndo).toBe(false)
  })

  it('правки подряд складываются в один шаг', async () => {
    const start = doc(1)
    const { result, rerender, undo, wait } = setup(start)

    // так выглядит перетаскивание слоя: много правок без пауз
    rerender(doc(2))
    await wait(40)
    rerender(doc(3))
    await wait(40)
    rerender(doc(4))
    await wait()

    expect(undo()).toBe(start)
    expect(result.current.canUndo).toBe(false)
  })

  it('отменяет правку, которая ещё не успела записаться', () => {
    const start = doc(1)
    const { rerender, undo } = setup(start)

    rerender(doc(2))
    // паузу не ждём: человек нажал отмену сразу
    expect(undo()).toBe(start)
  })

  it('возвращает отменённое обратно', async () => {
    const start = doc(1)
    const second = doc(2)
    const { result, rerender, undo, redo, wait } = setup(start)

    rerender(second)
    await wait()
    undo()
    expect(result.current.canRedo).toBe(true)

    expect(redo()).toBe(second)
    expect(result.current.canRedo).toBe(false)
    expect(result.current.canUndo).toBe(true)
  })

  it('новая правка отменяет возможность вернуться вперёд', async () => {
    const { result, rerender, undo, wait } = setup(doc(1))

    rerender(doc(2))
    await wait()
    undo()
    expect(result.current.canRedo).toBe(true)

    rerender(doc(3))
    await wait()
    expect(result.current.canRedo).toBe(false)
  })

  it('помнит ограниченное число шагов', async () => {
    const { result, rerender, undo, wait } = setup(doc(0))

    for (let i = 1; i <= 5; i++) {
      rerender(doc(i))
      await wait()
    }

    // предел 3: дальше третьего шага назад не уйти
    let steps = 0
    while (result.current.canUndo && steps < 10) {
      undo()
      steps++
    }
    expect(steps).toBe(3)
  })

  it('после открытия другого проекта прошлое не тянется следом', async () => {
    const { result, rerender, wait } = setup(doc(1))

    rerender(doc(2))
    await wait()
    expect(result.current.canUndo).toBe(true)

    act(() => result.current.reset())
    rerender(doc(100, ['из другого проекта']))
    await wait()

    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })

  it('отдаёт все состояния, на которые ещё можно вернуться', async () => {
    const start = doc(1, ['а'])
    const { result, rerender, undo, wait } = setup(start)

    rerender(doc(2, ['а', 'б']))
    await wait()
    undo()

    const layers = result.current.states().flatMap((s) => s.layers)
    expect(layers).toContain('а')
    expect(layers).toContain('б')
  })
})
