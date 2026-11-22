const UNDO_LIMIT = 80;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function splitLines(text) {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  return lines.length ? lines : [''];
}

function capture(buf) {
  return {
    lines: buf.lines.slice(),
    line: buf.line,
    col: buf.col,
    anchorLine: buf.anchorLine,
    anchorCol: buf.anchorCol,
    scroll: buf.scroll,
    scrollX: buf.scrollX,
    preferredCol: buf.preferredCol,
  };
}

function restore(buf, snap) {
  buf.lines = snap.lines.slice();
  buf.line = snap.line;
  buf.col = snap.col;
  buf.anchorLine = snap.anchorLine;
  buf.anchorCol = snap.anchorCol;
  buf.scroll = snap.scroll;
  buf.scrollX = snap.scrollX;
  buf.preferredCol = snap.preferredCol;
}

function pushUndo(buf) {
  buf.undo.push(capture(buf));
  if (buf.undo.length > UNDO_LIMIT) buf.undo.shift();
  buf.redo.length = 0;
}

export function createBuffer(text = '') {
  return {
    lines: splitLines(text),
    line: 0,
    col: 0,
    anchorLine: null,
    anchorCol: null,
    preferredCol: 0,
    scroll: 0,
    scrollX: 0,
    visibleLines: 24,
    visibleCols: 48,
    undo: [],
    redo: [],
  };
}

export function textOf(buf) {
  return buf.lines.join('\n');
}

export function undo(buf) {
  const prev = buf.undo.pop();
  if (!prev) return false;
  buf.redo.push(capture(buf));
  restore(buf, prev);
  return true;
}

export function redo(buf) {
  const next = buf.redo.pop();
  if (!next) return false;
  buf.undo.push(capture(buf));
  restore(buf, next);
  return true;
}

export function hasSelection(buf) {
  return buf.anchorLine != null && (buf.anchorLine !== buf.line || buf.anchorCol !== buf.col);
}

export function orderedSelection(buf) {
  if (!hasSelection(buf)) return null;
  const a = { line: buf.anchorLine, col: buf.anchorCol };
  const b = { line: buf.line, col: buf.col };
  if (a.line < b.line || (a.line === b.line && a.col <= b.col)) return { start: a, end: b };
  return { start: b, end: a };
}

function clearSelection(buf) {
  buf.anchorLine = null;
  buf.anchorCol = null;
}

function deleteRange(buf, start, end) {
  if (start.line === end.line) {
    const line = buf.lines[start.line];
    buf.lines[start.line] = line.slice(0, start.col) + line.slice(end.col);
  } else {
    const head = buf.lines[start.line].slice(0, start.col);
    const tail = buf.lines[end.line].slice(end.col);
    buf.lines.splice(start.line, end.line - start.line + 1, head + tail);
  }
  buf.line = start.line;
  buf.col = start.col;
  clearSelection(buf);
}

export function insertText(buf, text) {
  if (text == null || text === '') return;
  pushUndo(buf);
  if (hasSelection(buf)) {
    const { start, end } = orderedSelection(buf);
    deleteRange(buf, start, end);
  }
  const parts = splitLines(text);
  const line = buf.lines[buf.line] ?? '';
  const before = line.slice(0, buf.col);
  const after = line.slice(buf.col);
  if (parts.length === 1) {
    buf.lines[buf.line] = before + parts[0] + after;
    buf.col += parts[0].length;
  } else {
    const assembled = parts.slice();
    assembled[0] = before + assembled[0];
    const last = assembled.length - 1;
    assembled[last] += after;
    buf.lines.splice(buf.line, 1, ...assembled);
    buf.line += last;
    buf.col = parts[last].length;
  }
  buf.preferredCol = buf.col;
  ensureCaretVisible(buf);
}

export function backspace(buf) {
  if (hasSelection(buf)) {
    pushUndo(buf);
    const { start, end } = orderedSelection(buf);
    deleteRange(buf, start, end);
    buf.preferredCol = buf.col;
    ensureCaretVisible(buf);
    return;
  }
  if (buf.line === 0 && buf.col === 0) return;
  pushUndo(buf);
  if (buf.col > 0) {
    const line = buf.lines[buf.line];
    buf.lines[buf.line] = line.slice(0, buf.col - 1) + line.slice(buf.col);
    buf.col -= 1;
  } else {
    const col = buf.lines[buf.line - 1].length;
    buf.lines[buf.line - 1] += buf.lines[buf.line];
    buf.lines.splice(buf.line, 1);
    buf.line -= 1;
    buf.col = col;
  }
  buf.preferredCol = buf.col;
  ensureCaretVisible(buf);
}

export function deleteForward(buf) {
  if (hasSelection(buf)) {
    backspace(buf);
    return;
  }
  if (buf.col < buf.lines[buf.line].length) {
    pushUndo(buf);
    const line = buf.lines[buf.line];
    buf.lines[buf.line] = line.slice(0, buf.col) + line.slice(buf.col + 1);
    return;
  }
  if (buf.line >= buf.lines.length - 1) return;
  pushUndo(buf);
  buf.lines[buf.line] += buf.lines[buf.line + 1];
  buf.lines.splice(buf.line + 1, 1);
}

export function moveCursor(buf, dLine, dCol, extend) {
  if (extend) {
    if (buf.anchorLine == null) {
      buf.anchorLine = buf.line;
      buf.anchorCol = buf.col;
    }
  } else if (hasSelection(buf) && dLine === 0 && dCol !== 0) {
    const { start, end } = orderedSelection(buf);
    const target = dCol < 0 ? start : end;
    buf.line = target.line;
    buf.col = target.col;
    clearSelection(buf);
    buf.preferredCol = buf.col;
    ensureCaretVisible(buf);
    return;
  } else {
    clearSelection(buf);
  }

  if (dLine !== 0) {
    buf.line = clamp(buf.line + dLine, 0, buf.lines.length - 1);
    buf.col = Math.min(buf.preferredCol, buf.lines[buf.line].length);
  }

  if (dCol !== 0) {
    let line = buf.line;
    let col = buf.col;
    let left = Math.abs(dCol);
    const dir = Math.sign(dCol);
    while (left > 0) {
      if (dir < 0) {
        if (col > 0) col -= 1;
        else if (line > 0) {
          line -= 1;
          col = buf.lines[line].length;
        } else break;
      } else if (col < buf.lines[line].length) {
        col += 1;
      } else if (line < buf.lines.length - 1) {
        line += 1;
        col = 0;
      } else break;
      left -= 1;
    }
    buf.line = line;
    buf.col = col;
    buf.preferredCol = col;
  }
  ensureCaretVisible(buf);
}

export function moveLineEdge(buf, toEnd, extend) {
  if (extend) {
    if (buf.anchorLine == null) {
      buf.anchorLine = buf.line;
      buf.anchorCol = buf.col;
    }
  } else {
    clearSelection(buf);
  }
  buf.col = toEnd ? buf.lines[buf.line].length : 0;
  buf.preferredCol = buf.col;
  ensureCaretVisible(buf);
}

export function setCaret(buf, line, col, extend) {
  const nextLine = clamp(line, 0, buf.lines.length - 1);
  const nextCol = clamp(col, 0, buf.lines[nextLine].length);
  if (extend) {
    if (buf.anchorLine == null) {
      buf.anchorLine = buf.line;
      buf.anchorCol = buf.col;
    }
  } else {
    clearSelection(buf);
  }
  buf.line = nextLine;
  buf.col = nextCol;
  buf.preferredCol = buf.col;
  ensureCaretVisible(buf);
}

export function selectAll(buf) {
  buf.anchorLine = 0;
  buf.anchorCol = 0;
  buf.line = buf.lines.length - 1;
  buf.col = buf.lines[buf.line].length;
  buf.preferredCol = buf.col;
  ensureCaretVisible(buf);
}

export function selectedText(buf) {
  const sel = orderedSelection(buf);
  if (!sel) return '';
  const { start, end } = sel;
  if (start.line === end.line) return buf.lines[start.line].slice(start.col, end.col);
  const parts = [buf.lines[start.line].slice(start.col)];
  for (let i = start.line + 1; i < end.line; i += 1) parts.push(buf.lines[i]);
  parts.push(buf.lines[end.line].slice(0, end.col));
  return parts.join('\n');
}

export function replaceAll(buf, text) {
  pushUndo(buf);
  buf.lines = splitLines(text);
  buf.line = 0;
  buf.col = 0;
  clearSelection(buf);
  buf.scroll = 0;
  buf.scrollX = 0;
  buf.preferredCol = 0;
}

export function scrollBy(buf, delta) {
  const max = Math.max(0, buf.lines.length - buf.visibleLines);
  buf.scroll = clamp(buf.scroll + delta, 0, max);
}

export function ensureCaretVisible(buf) {
  if (buf.line < buf.scroll) buf.scroll = buf.line;
  if (buf.line >= buf.scroll + buf.visibleLines) {
    buf.scroll = buf.line - buf.visibleLines + 1;
  }
  const max = Math.max(0, buf.lines.length - buf.visibleLines);
  buf.scroll = clamp(buf.scroll, 0, max);
  if (buf.col < buf.scrollX) buf.scrollX = buf.col;
  if (buf.col >= buf.scrollX + buf.visibleCols) {
    buf.scrollX = buf.col - buf.visibleCols + 1;
  }
  buf.scrollX = Math.max(0, buf.scrollX);
}

export function caretFromPixel(buf, x, y, metrics) {
  const { padX, padY, lineHeight, charW, gutter } = metrics;
  const rawLine = buf.scroll + Math.floor((y - padY) / lineHeight);
  const line = clamp(rawLine, 0, buf.lines.length - 1);
  const rawCol = Math.round((x - padX - gutter) / charW) + buf.scrollX;
  const col = clamp(rawCol, 0, buf.lines[line].length);
  return { line, col };
}
