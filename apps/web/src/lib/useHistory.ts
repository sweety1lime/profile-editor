import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Отмена и возврат правок. Состояние — плоский объект, и каждая правка создаёт новые массивы
// и объекты, поэтому поля сравниваем по ссылкам.
// Правки, идущие вплотную, складываются в одну запись: иначе перетаскивание слоя оставило бы
// в истории по шагу на каждый пиксель

const same = <T extends object>(a: T, b: T): boolean => {
  const keys = Object.keys(a) as (keyof T)[]
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key])
}

export interface History<T> {
  canUndo: boolean
  canRedo: boolean
  // возвращают состояние, которое надо разложить обратно, или null, если возвращаться некуда
  undo(): T | null
  redo(): T | null
  // начали другую работу: прошлое к ней не относится
  reset(): void
  // всё, на что человек ещё может вернуться
  states(): T[]
}

export function useHistory<T extends object>(current: T, { delay = 400, limit = 60 } = {}): History<T> {
  const past = useRef<T[]>([])
  const future = useRef<T[]>([])
  const present = useRef(current)
  const latest = useRef(current)
  // состояние, которое мы сами только что вернули: записывать его обратно в историю не надо
  const expected = useRef<T | null>(null)
  const adopt = useRef(false)
  const [, setVersion] = useState(0)
  const redraw = useCallback(() => setVersion((n) => n + 1), [])

  latest.current = current

  useEffect(() => {
    if (adopt.current) {
      adopt.current = false
      present.current = current
      past.current = []
      future.current = []
      redraw()
      return
    }
    if (expected.current && same(current, expected.current)) {
      expected.current = null
      present.current = current
      return
    }
    if (same(current, present.current)) return
    // ждём паузы: пока правки идут подряд, запись откладывается
    const timer = setTimeout(() => {
      past.current = [...past.current, present.current].slice(-limit)
      present.current = latest.current
      future.current = []
      redraw()
    }, delay)
    return () => clearTimeout(timer)
  }, [current, delay, limit, redraw])

  const undo = useCallback(() => {
    const now = latest.current
    // правка ещё не успела записаться — отменяем именно её
    if (!same(now, present.current)) {
      future.current = [now, ...future.current]
      expected.current = present.current
      redraw()
      return present.current
    }
    const prev = past.current.at(-1)
    if (!prev) return null
    past.current = past.current.slice(0, -1)
    future.current = [now, ...future.current]
    present.current = prev
    expected.current = prev
    redraw()
    return prev
  }, [redraw])

  const redo = useCallback(() => {
    const next = future.current[0]
    if (!next) return null
    future.current = future.current.slice(1)
    past.current = [...past.current, present.current]
    present.current = next
    expected.current = next
    redraw()
    return next
  }, [redraw])

  const reset = useCallback(() => {
    past.current = []
    future.current = []
    present.current = latest.current
    expected.current = null
    adopt.current = true
    redraw()
  }, [redraw])

  const states = useCallback(() => [...past.current, present.current, ...future.current], [])

  const canUndo = past.current.length > 0 || !same(current, present.current)
  const canRedo = future.current.length > 0

  return useMemo(
    () => ({ canUndo, canRedo, undo, redo, reset, states }),
    [canUndo, canRedo, undo, redo, reset, states],
  )
}
