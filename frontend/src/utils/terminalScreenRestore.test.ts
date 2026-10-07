import { describe, expect, it } from 'vitest'
import { prepareTerminalWrite } from './terminalScreenRestore'

const MOUSE_OFF =
  '\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1004l\x1b[?1005l\x1b[?1006l\x1b[?1015l'

const RESTORE =
  '\x18' +
  '\x1b[?2026l' +
  '\x1b[r' +
  '\x1b[?6l' +
  '\x1b[?25h' +
  '\x1b(B' +
  MOUSE_OFF +
  '\x1b[?2004l'

describe('prepareTerminalWrite()', () => {
  it('rewrites a normal-buffer clear into scrollback and restores shell modes', () => {
    const scrolled = '\n'.repeat(24) + '\x1b[H'
    for (const chunk of ['\x1b[H\x1b[2J', '\x1b[2J']) {
      const result = prepareTerminalWrite(chunk, { rows: 24, alternate: false })
      expect(result.startsWith(RESTORE)).toBe(true)
      expect(result).toContain(scrolled)
      expect(result).not.toContain('\x1b[2J')
      expect(result).toBe(RESTORE + scrolled)
    }
    expect(prepareTerminalWrite('\x1b[3J', { rows: 24, alternate: false })).toBe('')
    expect(prepareTerminalWrite('ok\x1b[3J', { rows: 24, alternate: false })).toBe('ok')
  })

  it('returns plain shell output unchanged', () => {
    const chunk = 'user@host:~$ ls\r\nbin\r\n'
    expect(prepareTerminalWrite(chunk, { rows: 24, alternate: false })).toBe(chunk)
    expect(prepareTerminalWrite(chunk, { rows: 24, alternate: true })).toBe(chunk)
  })

  it('keeps an alternate-screen erase and only ends synchronized output', () => {
    const chunk = '\x1b[H\x1b[2J'
    const result = prepareTerminalWrite(chunk, { rows: 24, alternate: true })
    expect(result).toBe('\x18\x1b[?2026l' + chunk)
    expect(result.startsWith('\x18\x1b[?2026l')).toBe(true)
    expect(result).not.toContain('\x1b[?1000l')
    expect(result).not.toContain('\x1b[r')
    expect(result).not.toContain('\n')
  })

  it('restores once after leaving the alternate screen and scrolls only the trailing clear', () => {
    const exit = '\x1b[?1049l'
    const clear = '\x1b[H\x1b[2J'
    const scrolled = '\n'.repeat(24) + '\x1b[H'
    const trailed = prepareTerminalWrite(exit + clear, { rows: 24, alternate: true })
    expect(trailed).toBe(exit + RESTORE + scrolled)

    const ahead = prepareTerminalWrite(clear + exit + clear, { rows: 24, alternate: true })
    expect(ahead).toBe('\x18\x1b[?2026l' + clear + exit + RESTORE + scrolled)
    expect(ahead.split('\x1b[?2004l').length - 1).toBe(1)
  })

  it('restores after 47 and 1047 exits, and only once when a normal buffer also clears', () => {
    for (const exit of ['\x1b[?47l', '\x1b[?1047l']) {
      expect(prepareTerminalWrite(exit + '\x1b[H\x1b[2J', { rows: 24, alternate: true }))
        .toBe(exit + RESTORE + '\n'.repeat(24) + '\x1b[H')
    }
    const both = prepareTerminalWrite('\x1b[?1049l\x1b[H\x1b[2J', { rows: 24, alternate: false })
    expect(both).toBe('\x1b[?1049l' + RESTORE + '\n'.repeat(24) + '\x1b[H')
    expect(both.split('\x1b[?2004l').length - 1).toBe(1)
  })

  it('substitutes zero newlines when rows is 0 and leaves an empty chunk empty', () => {
    expect(prepareTerminalWrite('\x1b[H\x1b[2J', { rows: 0, alternate: false })).toBe(RESTORE + '\x1b[H')
    expect(prepareTerminalWrite('\x1b[2J', { rows: 0, alternate: false })).toBe(RESTORE + '\x1b[H')
    expect(prepareTerminalWrite('', { rows: 24, alternate: false })).toBe('')
  })
})
