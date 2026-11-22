import {
  backspace,
  createBuffer,
  deleteForward,
  insertText,
  moveCursor,
  moveLineEdge,
  redo,
  replaceAll,
  scrollBy,
  selectAll,
  selectedText,
  setCaret,
  textOf,
  undo,
} from '../core/buffer.js';

function snapshot(buf) {
  return { text: textOf(buf), line: buf.line, column: buf.col };
}

export function createEditor(initialText = '') {
  const buf = createBuffer(initialText);
  let listener = null;
  const touch = () => listener?.();
  return {
    buffer: buf,
    setListener(fn) { listener = fn; },
    snapshot() { return snapshot(buf); },
    selectedText() { return selectedText(buf); },
    insert(text) {
      insertText(buf, text);
      touch();
      return snapshot(buf);
    },
    replace(text) {
      replaceAll(buf, text);
      touch();
      return snapshot(buf);
    },
    backspace() {
      backspace(buf);
      touch();
      return snapshot(buf);
    },
    deleteSelection() {
      deleteForward(buf);
      touch();
      return snapshot(buf);
    },
    move(lineDelta, columnDelta, extend) {
      moveCursor(buf, lineDelta, columnDelta, Boolean(extend));
      return snapshot(buf);
    },
    edge(toEnd, extend) {
      moveLineEdge(buf, Boolean(toEnd), Boolean(extend));
      return snapshot(buf);
    },
    setCursor(line, column, extend) {
      setCaret(buf, line, column, Boolean(extend));
      return snapshot(buf);
    },
    selectAll() {
      selectAll(buf);
      return snapshot(buf);
    },
    undo() {
      undo(buf);
      touch();
      return snapshot(buf);
    },
    redo() {
      redo(buf);
      touch();
      return snapshot(buf);
    },
    scroll(delta) {
      scrollBy(buf, delta);
      return snapshot(buf);
    },
    input(key, extend = false) {
      if (key === 'Backspace') return this.backspace();
      if (key === 'Delete') return this.deleteSelection();
      if (key === 'Enter') return this.insert('\n');
      if (key === 'Tab') return this.insert('  ');
      if (key === 'ArrowLeft') return this.move(0, -1, extend);
      if (key === 'ArrowRight') return this.move(0, 1, extend);
      if (key === 'ArrowUp') return this.move(-1, 0, extend);
      if (key === 'ArrowDown') return this.move(1, 0, extend);
      if (key === 'Home') return this.edge(false, extend);
      if (key === 'End') return this.edge(true, extend);
      if (key === 'Undo') return this.undo();
      if (key === 'Redo') return this.redo();
      if (key === 'SelectAll') return this.selectAll();
      if (key.length === 1) return this.insert(key);
      return snapshot(buf);
    },
  };
}
