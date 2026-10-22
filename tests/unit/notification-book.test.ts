import { describe, expect, it, vi } from 'vitest'
import { NotificationBook } from '../../src/main/notification-book'

const make = (cap = 100) => {
  const close = vi.fn()
  return { close, book: new NotificationBook<object>(close, cap) }
}

describe('NotificationBook', () => {
  it('closes the previous entry with the same tag', () => {
    const { book, close } = make()
    const a = {}
    const b = {}
    book.add('x', 'n1', 't', a)
    book.add('x', 'n2', 't', b)
    expect(close).toHaveBeenCalledWith(a)
    expect(book.take('x', 'n1')).toBeUndefined()
    expect(book.take('x', 'n2')).toBe(b)
  })

  it('evicts the oldest past the cap', () => {
    const { book, close } = make(2)
    const [a, b, c] = [{}, {}, {}]
    book.add('x', 'n1', '', a)
    book.add('x', 'n2', '', b)
    book.add('x', 'n3', '', c)
    expect(close).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledWith(a)
    expect(book.take('x', 'n1')).toBeUndefined()
  })

  it('forget with a stale handle does nothing', () => {
    const { book } = make()
    const a = {}
    book.add('x', 'n1', '', a)
    book.forget('x', 'n1', {})
    expect(book.take('x', 'n1')).toBe(a)
  })

  it('forgetAccount clears entries and tags', () => {
    const { book, close } = make()
    const a = { id: 'a' }
    const b = { id: 'b' }
    book.add('x', 'n1', 't', a)
    book.add('y', 'n1', 't', b)
    book.forgetAccount('x')
    expect(close).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledWith(a)
    close.mockClear()
    book.add('x', 'n2', 't', {})
    expect(close).not.toHaveBeenCalled()
    expect(book.take('y', 'n1')).toBe(b)
  })

  it('a taken tag entry does not close the new notification', () => {
    const { book, close } = make()
    book.add('x', 'n1', 't', {})
    book.take('x', 'n1')
    const b = {}
    book.add('x', 'n1', 't', b)
    book.add('x', 'n2', 't2', {})
    expect(close).not.toHaveBeenCalledWith(b)
    expect(book.take('x', 'n1')).toBe(b)
  })

  it('namespaces nids per account', () => {
    const { book } = make()
    const [a, b] = [{}, {}]
    book.add('x', 'n1', '', a)
    book.add('y', 'n1', '', b)
    expect(book.take('y', 'n1')).toBe(b)
    expect(book.take('x', 'n1')).toBe(a)
  })

  it('close closes and removes', () => {
    const { book, close } = make()
    const a = {}
    book.add('x', 'n1', 't', a)
    book.close('x', 'n1')
    expect(close).toHaveBeenCalledWith(a)
    expect(book.take('x', 'n1')).toBeUndefined()
  })
})
