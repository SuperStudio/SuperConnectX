import { describe, expect, it } from 'vitest'
import { takeDecorationOverflow } from '../../src/renderer/src/utils/DecorationLimit'

describe('takeDecorationOverflow', () => {
  it('keeps IDs unchanged while below the limit', () => {
    const ids = ['a', 'b']

    expect(takeDecorationOverflow(ids, 3)).toEqual([])
    expect(ids).toEqual(['a', 'b'])
  })

  it('removes the oldest IDs when the limit is exceeded', () => {
    const ids = ['a', 'b', 'c', 'd']

    expect(takeDecorationOverflow(ids, 2)).toEqual(['a', 'b'])
    expect(ids).toEqual(['c', 'd'])
  })

  it('supports clearing all tracked IDs', () => {
    const ids = ['a', 'b']

    expect(takeDecorationOverflow(ids, 0)).toEqual(['a', 'b'])
    expect(ids).toEqual([])
  })
})
