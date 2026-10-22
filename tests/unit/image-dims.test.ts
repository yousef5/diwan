import { describe, expect, test } from 'vitest'
import { dataUrlDims, imageDims } from '../../src/shared/image-dims'
import { jpegHeader, PNG_1x1, pngHeader, webpVp8l } from './helpers/images'

describe('imageDims', () => {
  test('PNG', () => {
    expect(imageDims(pngHeader(30000, 20000))).toEqual({ width: 30000, height: 20000 })
    expect(dataUrlDims(`data:image/png;base64,${PNG_1x1}`)).toEqual({ width: 1, height: 1 })
  })
  test('JPEG SOF0 after another segment', () => {
    expect(imageDims(jpegHeader(5000, 4000))).toEqual({ width: 5000, height: 4000 })
  })
  test('WebP VP8L', () => {
    expect(imageDims(webpVp8l(300, 200))).toEqual({ width: 300, height: 200 })
  })
  test('garbage is null', () => {
    expect(imageDims(new Uint8Array([1, 2, 3]))).toBeNull()
    expect(dataUrlDims(`data:image/png;base64,${Buffer.from('hello').toString('base64')}`)).toBeNull()
    expect(dataUrlDims('data:image/png;base64,@@@')).toBeNull()
  })
})
