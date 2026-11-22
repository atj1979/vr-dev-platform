import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { installCommands } from '../src/commands/catalog.js';
import { listCommandSpecs } from '../src/commands/registry.js';

installCommands();

describe('generated API docs', () => {
  it('mentions every registered command', () => {
    const docs = readFileSync(new URL('../docs/API.md', import.meta.url), 'utf8');
    expect(docs).toContain('Generated from the command registry');
    for (const spec of listCommandSpecs()) {
      expect(docs).toContain(`## \`${spec.name}\``);
    }
  });
});
