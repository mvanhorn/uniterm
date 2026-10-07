// A TUI killed mid-frame leaves synchronized output (DEC 2026), a clipped
// scrolling region, origin mode, a hidden cursor, the line-drawing G0
// charset, mouse tracking, or bracketed paste set. The shell prompt then
// draws into that frame, and `clear` neither blanks the screen nor paints.
//
// ED3 is stripped so scrollback is kept. On the normal buffer, ED2 — including
// the `ESC [ H ESC [ 2 J` form `clear` sends — is rewritten as `rows` newlines
// plus home so the viewport is pushed into scrollback. An ED2 that is still on
// the alternate screen is not rewritten (that is the vim-residue regression);
// it only gains CAN plus reset of DEC 2026 so the erase can paint. Bytes
// before an alternate-screen exit keep the buffer type they arrived with.

// Copied from Panel.vue RESET_MOUSE_MODES. This write path must not import
// the component; the byte order is part of the restore contract.
const MOUSE_OFF =
  '\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1004l\x1b[?1005l\x1b[?1006l\x1b[?1015l'

const SHELL_RESTORE =
  '\x18' +
  '\x1b[?2026l' +
  '\x1b[r' +
  '\x1b[?6l' +
  '\x1b[?25h' +
  '\x1b(B' +
  MOUSE_OFF +
  '\x1b[?2004l'

// CAN aborts a control string the killed process left open; 2026l ends
// synchronized output so the following erase is painted.
const ALT_ERASE_PREFIX = '\x18\x1b[?2026l'

function applyClear(
  segment: string,
  alternate: boolean,
  rows: number,
  alreadyRestored: boolean,
): { text: string; restored: boolean } {
  if (segment === '' || !segment.includes('\x1b[2J')) {
    return { text: segment, restored: alreadyRestored }
  }
  if (alternate) {
    return { text: ALT_ERASE_PREFIX + segment, restored: alreadyRestored }
  }
  const scrollClear = '\n'.repeat(rows) + '\x1b[H'
  const rewritten = segment
    .replace(/\x1b\[H\x1b\[2J/g, scrollClear)
    .replace(/\x1b\[2J/g, scrollClear)
  if (alreadyRestored) return { text: rewritten, restored: true }
  return { text: SHELL_RESTORE + rewritten, restored: true }
}

export function prepareTerminalWrite(
  data: string,
  options: { rows: number; alternate: boolean },
): string {
  if (data === '') return ''
  const text = data.replace(/\x1b\[3J/g, '')
  if (text === '') return ''

  const { rows } = options
  const exitRe = /\x1b\[\?(?:1049|1047|47)l/g
  let onAlternate = options.alternate
  let restored = false
  let out = ''
  let cursor = 0

  let match: RegExpExecArray | null
  while ((match = exitRe.exec(text)) !== null) {
    const piece = applyClear(text.slice(cursor, match.index), onAlternate, rows, restored)
    out += piece.text
    restored = piece.restored
    out += match[0]
    onAlternate = false
    if (!restored) {
      out += SHELL_RESTORE
      restored = true
    }
    cursor = match.index + match[0].length
  }
  out += applyClear(text.slice(cursor), onAlternate, rows, restored).text
  return out
}
