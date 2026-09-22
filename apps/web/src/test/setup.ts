import 'fake-indexeddb/auto'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// IndexedDB в jsdom нет, поэтому подставляем поддельную, а отрисованное убираем за каждым тестом
afterEach(cleanup)
