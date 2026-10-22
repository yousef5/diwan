import { describe, expect, test } from 'vitest'
import { chatUrl, classifyLink } from '../../src/main/link-policy'

describe('chatUrl', () => {
  test('keeps digits only and encodes text', () => {
    expect(chatUrl('+20 100-123', 'hi there')).toBe(
      'https://web.whatsapp.com/send?phone=20100123&text=hi+there',
    )
  })
  test('no params', () => {
    expect(chatUrl(null, null)).toBe('https://web.whatsapp.com/send')
  })
})

describe('classifyLink', () => {
  const cases: [string, ReturnType<typeof classifyLink>][] = [
    ['https://web.whatsapp.com/', { kind: 'internal' }],
    [
      'https://web.whatsapp.com/send?phone=201001234567&text=a',
      {
        kind: 'chat',
        url: 'https://web.whatsapp.com/send?phone=201001234567&text=a',
      },
    ],
    [
      'https://wa.me/201001234567?text=hello',
      {
        kind: 'chat',
        url: 'https://web.whatsapp.com/send?phone=201001234567&text=hello',
      },
    ],
    ['https://wa.me/message/ABCDEF', { kind: 'external', url: 'https://wa.me/message/ABCDEF' }],
    [
      'https://api.whatsapp.com/send?phone=201001234567',
      {
        kind: 'chat',
        url: 'https://web.whatsapp.com/send?phone=201001234567',
      },
    ],
    [
      'whatsapp://send?phone=201001234567&text=x',
      {
        kind: 'chat',
        url: 'https://web.whatsapp.com/send?phone=201001234567&text=x',
      },
    ],
    [
      'https://backup.altarshoubyWhats.com/webchat?id=7',
      {
        kind: 'external',
        url: 'https://backup.altarshoubywhats.com/webchat?id=7',
      },
    ],
    ['http://example.com/a', { kind: 'external', url: 'http://example.com/a' }],
    ['mailto:a@b.c', { kind: 'external', url: 'mailto:a@b.c' }],
    ['tel:+20100', { kind: 'external', url: 'tel:+20100' }],
    ['blob:https://web.whatsapp.com/1b2c', { kind: 'download', url: 'blob:https://web.whatsapp.com/1b2c' }],
    ['blob:https://evil.example/1b2c', { kind: 'blocked', reason: 'foreign blob' }],
    ['file:///etc/passwd', { kind: 'blocked', reason: 'scheme file:' }],
    ['javascript:alert(1)', { kind: 'blocked', reason: 'scheme javascript:' }],
    ['https://web.whatsapp.com@evil.com/', { kind: 'external', url: 'https://web.whatsapp.com@evil.com/' }],
    ['https://web.whatsapp.com.evil.com/', { kind: 'external', url: 'https://web.whatsapp.com.evil.com/' }],
    ['https://web.whatsapp.com./', { kind: 'external', url: 'https://web.whatsapp.com./' }],
    ['http://web.whatsapp.com/', { kind: 'external', url: 'http://web.whatsapp.com/' }],
    ['https://w\u0435b.whatsapp.com/', { kind: 'external', url: 'https://xn--wb-nlc.whatsapp.com/' }],
    ['blob:http://web.whatsapp.com/x', { kind: 'blocked', reason: 'foreign blob' }],
    ['data:text/html,x', { kind: 'blocked', reason: 'scheme data:' }],
    ['HTTPS://WEB.WHATSAPP.COM/', { kind: 'internal' }],
    ['https://web.whatsapp.com:8443/', { kind: 'external', url: 'https://web.whatsapp.com:8443/' }],
    ['https://evil.com@web.whatsapp.com/', { kind: 'external', url: 'https://evil.com@web.whatsapp.com/' }],
    ['https://user@wa.me/201001234567', { kind: 'external', url: 'https://user@wa.me/201001234567' }],
    [
      'https://api.whatsapp.com:444/send?phone=2010012',
      { kind: 'external', url: 'https://api.whatsapp.com:444/send?phone=2010012' },
    ],
    [
      'mailto:a@b.c?subject=hi&attach=/home/joe/.ssh/id_rsa',
      { kind: 'external', url: 'mailto:a@b.c?subject=hi' },
    ],
    ['mailto:a@b.c\n', { kind: 'external', url: 'mailto:a@b.c' }],
    [' tel:+20100', { kind: 'external', url: 'tel:+20100' }],
    ['blob:https://web.whatsapp.com/1b2c\n', { kind: 'download', url: 'blob:https://web.whatsapp.com/1b2c' }],
    ['not a url', { kind: 'blocked', reason: 'invalid url' }],
  ]
  test.each(cases)('%s', (url, expected) => {
    expect(classifyLink(url)).toEqual(expected)
  })
})
