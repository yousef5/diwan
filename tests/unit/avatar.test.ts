// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { findAvatarDataUrl, MIN_SCORE, pickAvatar, scoreAvatar } from '../../src/preload/avatar'

const own = { top: 900, left: 16, width: 32, height: 32, alt: '', round: true } // new layout: bottom of the nav rail
const ownOld = { top: 10, left: 16, width: 40, height: 40, alt: 'profile', round: true } // old layout: top-left header
const contact = { top: 110, left: 88, width: 49, height: 49, alt: 'Ali', round: true } // first chat in the list
const contactOld = { top: 140, left: 13, width: 49, height: 49, alt: 'Ali', round: true }

describe('scoreAvatar', () => {
  test('own picture beats contacts in the new layout', () => {
    expect(scoreAvatar(own)).toBeGreaterThan(scoreAvatar(contact))
    expect(scoreAvatar(own)).toBeGreaterThanOrEqual(MIN_SCORE)
  })
  test('the first chat row alone is never good enough', () => {
    expect(scoreAvatar(contact)).toBeLessThan(MIN_SCORE)
  })
  test('own picture beats contacts in the old layout', () => {
    expect(scoreAvatar(ownOld)).toBeGreaterThan(scoreAvatar(contactOld))
  })
  test('tiny or huge images are never avatars', () => {
    expect(scoreAvatar({ ...own, width: 10, height: 10 })).toBe(-1)
    expect(scoreAvatar({ ...own, width: 300, height: 300 })).toBe(-1)
  })
})

type Box = { top: number; left: number; width: number; height: number }
function addImg(src: string, box: Box, alt = '', radius = '50%'): HTMLImageElement {
  const img = document.createElement('img')
  img.src = src
  img.alt = alt
  img.style.borderRadius = radius
  img.getBoundingClientRect = () =>
    ({ ...box, right: box.left + box.width, bottom: box.top + box.height }) as DOMRect
  document.body.append(img)
  return img
}

afterEach(() => {
  document.body.replaceChildren()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('pickAvatar', () => {
  test('picks the own picture over contact pictures', () => {
    addImg('https://pps.whatsapp.net/v/contact.jpg', contact, 'Ali')
    const mine = addImg('https://pps.whatsapp.net/v/own.jpg', own)
    addImg('https://pps.whatsapp.net/v/contact2.jpg', { ...contact, top: 182 }, 'Mona')
    expect(pickAvatar(document)).toBe(mine)
  })

  test('returns null while only contact pictures are on screen', () => {
    addImg('https://pps.whatsapp.net/v/contact.jpg', contact, 'Ali')
    expect(pickAvatar(document)).toBeNull()
  })

  test('a square picture loses the round bonus', () => {
    addImg('https://pps.whatsapp.net/v/own.jpg', own, '', '0px') // 290 - 60 = 230 < MIN_SCORE
    expect(pickAvatar(document)).toBeNull()
  })

  test('ignores emoji, status rings and gif placeholders, however well placed', () => {
    addImg('https://web.whatsapp.com/img/emoji-1f600.png', ownOld, 'profile')
    addImg('https://pps.whatsapp.net/v/status-ring.jpg', ownOld, 'profile')
    addImg('data:image/gif;base64,R0lGODlhAQABAAAAACw=', ownOld, 'profile')
    expect(pickAvatar(document)).toBeNull()
  })
})

describe('findAvatarDataUrl', () => {
  function stubImagePipeline(size: { width: number; height: number }, out = 'image/png', has2d = true) {
    const canvases: { w: number; h: number }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ blob: async () => new Blob(['src']) })),
    )
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ ...size, close: () => {} })),
    )
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor(w: number, h: number) {
          canvases.push({ w, h })
        }
        getContext() {
          return has2d ? { drawImage: () => {} } : null
        }
        async convertToBlob() {
          return new Blob(['png'], { type: out })
        }
      },
    )
    return canvases
  }

  test('gives null when there is no avatar to take', async () => {
    const canvases = stubImagePipeline({ width: 96, height: 96 })
    await expect(findAvatarDataUrl(document)).resolves.toBeNull()
    expect(canvases).toEqual([])
  })

  test('re-encodes the picked picture to a PNG of at most 256 px', async () => {
    const canvases = stubImagePipeline({ width: 640, height: 640 })
    addImg('https://pps.whatsapp.net/v/own.jpg', own)
    await expect(findAvatarDataUrl(document)).resolves.toMatch(/^data:image\/png;base64,/)
    expect(canvases).toEqual([{ w: 256, h: 256 }])
    expect(fetch).toHaveBeenCalledWith('https://pps.whatsapp.net/v/own.jpg')
  })

  test('no 2D context gives null, never a blank PNG', async () => {
    stubImagePipeline({ width: 96, height: 96 }, 'image/png', false)
    addImg('https://pps.whatsapp.net/v/own.jpg', own)
    await expect(findAvatarDataUrl(document)).resolves.toBeNull()
  })

  test('anything but a PNG gives null', async () => {
    stubImagePipeline({ width: 96, height: 96 }, 'image/webp')
    addImg('https://pps.whatsapp.net/v/own.jpg', own)
    await expect(findAvatarDataUrl(document)).resolves.toBeNull()
  })

  test('gives null when the picture cannot be loaded', async () => {
    stubImagePipeline({ width: 96, height: 96 })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    addImg('https://pps.whatsapp.net/v/own.jpg', own)
    await expect(findAvatarDataUrl(document)).resolves.toBeNull()
  })

  test('a hung download gives up after 5 s, so the caller can try again', async () => {
    vi.useFakeTimers()
    stubImagePipeline({ width: 96, height: 96 })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    addImg('https://pps.whatsapp.net/v/own.jpg', own)
    const result = vi.fn()
    void findAvatarDataUrl(document).then(result)
    await vi.advanceTimersByTimeAsync(4900)
    expect(result).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(result).toHaveBeenCalledWith(null)
  })
})
