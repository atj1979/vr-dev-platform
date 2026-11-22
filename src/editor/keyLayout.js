const WIDTH = 1280;
const HEIGHT = 500;
const MARGIN = 12;
const GAP = 8;
const KEY_H = 64;

const ROWS = [
  '1234567890'.split(''),
  'qwertyuiop'.split(''),
  'asdfghjkl;'.split(''),
  'zxcvbnm,./'.split(''),
];

const SHIFTED_DIGITS = {
  1: '!', 2: '@', 3: '#', 4: '$', 5: '%', 6: '^', 7: '&', 8: '*', 9: '(', 0: ')',
};

const SYMBOL_ROWS = [
  ['[', ']', '{', '}', '<', '>', '(', ')', '\\', '|'],
  ['`', '~', "'", '"', '_', '-', '+', '=', '*', '&'],
  ['!', '?', ':', ';', '.', ',', '#', '%', '/', '^'],
  ['@', '$', '€', '°', '…', '·', '±', '×', '÷', '≈'],
];

function rowY(index) {
  return MARGIN + index * (KEY_H + GAP);
}

function grid(labels, row, actions) {
  const inner = WIDTH - MARGIN * 2;
  const w = (inner - GAP * (labels.length - 1)) / labels.length;
  return labels.map((label, index) => ({
    id: `k${row}-${index}`,
    label,
    x: MARGIN + index * (w + GAP),
    y: rowY(row),
    w,
    h: KEY_H,
    action: actions[index],
  }));
}

export function keyboardLayout({ symbols = false, shift = false } = {}) {
  const keys = [];
  const rows = symbols ? SYMBOL_ROWS : ROWS;
  rows.forEach((labels, row) => {
    const shown = labels.map((label) => {
      if (symbols) return label;
      if (row === 0 && shift) return SHIFTED_DIGITS[label] || label;
      if (shift) return label.toUpperCase();
      return label;
    });
    const actions = shown.map((label) => ({ type: 'text', text: label }));
    keys.push(...grid(shown, row, actions));
  });
  const y = rowY(4);
  const specials = [
    { id: 'sym', label: symbols ? 'ABC' : 'Sym', w: 110, action: { type: 'toggle', toggle: 'sym' } },
    { id: 'shift', label: shift ? 'SHIFT' : 'Shift', w: 120, action: { type: 'toggle', toggle: 'shift' } },
    { id: 'space', label: 'space', w: 280, action: { type: 'text', text: ' ' } },
    { id: 'bksp', label: 'Bksp', w: 120, action: { type: 'key', key: 'Backspace' } },
    { id: 'enter', label: 'Enter', w: 120, action: { type: 'key', key: 'Enter' } },
    { id: 'left', label: '←', w: 70, action: { type: 'key', key: 'ArrowLeft' } },
    { id: 'right', label: '→', w: 70, action: { type: 'key', key: 'ArrowRight' } },
    { id: 'up', label: '↑', w: 70, action: { type: 'key', key: 'ArrowUp' } },
    { id: 'down', label: '↓', w: 70, action: { type: 'key', key: 'ArrowDown' } },
    { id: 'tab', label: 'Tab', w: 90, action: { type: 'key', key: 'Tab' } },
    { id: 'undo', label: 'Undo', w: 90, action: { type: 'key', key: 'Undo' } },
  ];
  let x = MARGIN;
  for (const key of specials) {
    keys.push({ ...key, x, y, h: KEY_H });
    x += key.w + GAP;
  }
  return { width: WIDTH, height: HEIGHT, keys };
}

export const KEYBOARD_SIZE = { width: WIDTH, height: HEIGHT };
