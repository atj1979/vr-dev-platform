const KEYWORDS = new Set(
  `const let var function return if else for while new export default import from class extends
   this true false null undefined async await of in instanceof typeof break continue switch case
   throw try catch finally super static yield void delete`.split(/\s+/),
);

function isIdentStart(ch) {
  return /[A-Za-z_$]/.test(ch);
}

function isIdent(ch) {
  return /[A-Za-z0-9_$]/.test(ch);
}

function isDigit(ch) {
  return ch >= '0' && ch <= '9';
}

/**
 * Tokenize JavaScript for a small in-world editor.
 * Returns one array of { type, text } per line.
 * Block comments carry across lines.
 */
export function highlightLines(lines) {
  let block = false;
  return lines.map((line) => {
    const tokens = [];
    const push = (type, text) => {
      if (text) tokens.push({ type, text });
    };
    let i = 0;
    if (block) {
      const end = line.indexOf('*/');
      if (end === -1) {
        push('comment', line);
        return tokens;
      }
      push('comment', line.slice(0, end + 2));
      i = end + 2;
      block = false;
    }
    while (i < line.length) {
      const ch = line[i];
      const next = line[i + 1];
      if (ch === '/' && next === '/') {
        push('comment', line.slice(i));
        break;
      }
      if (ch === '/' && next === '*') {
        const end = line.indexOf('*/', i + 2);
        if (end === -1) {
          push('comment', line.slice(i));
          block = true;
          break;
        }
        push('comment', line.slice(i, end + 2));
        i = end + 2;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        let j = i + 1;
        while (j < line.length) {
          if (line[j] === '\\') {
            j += 2;
            continue;
          }
          if (line[j] === ch) {
            j += 1;
            break;
          }
          j += 1;
        }
        push('string', line.slice(i, j));
        i = j;
        continue;
      }
      if (isDigit(ch) && (i === 0 || !isIdent(line[i - 1]))) {
        let j = i + 1;
        while (j < line.length && /[0-9a-fA-FxX._]/.test(line[j])) j += 1;
        push('number', line.slice(i, j));
        i = j;
        continue;
      }
      if (isIdentStart(ch)) {
        let j = i + 1;
        while (j < line.length && isIdent(line[j])) j += 1;
        const word = line.slice(i, j);
        push(KEYWORDS.has(word) ? 'keyword' : 'ident', word);
        i = j;
        continue;
      }
      push('plain', ch);
      i += 1;
    }
    return tokens;
  });
}

export const TOKEN_COLORS = {
  plain: '#d5ddd8',
  ident: '#d5ddd8',
  keyword: '#e0a15a',
  string: '#8fd0b4',
  number: '#e7c07b',
  comment: '#6d7a74',
};
