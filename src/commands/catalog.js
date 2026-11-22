import { registerAiCommands } from '../ai/commands.js';
import { registerEditorCommands } from '../editor/commands.js';
import { registerExportCommands } from '../export/commands.js';
import { registerPreviewCommands } from '../preview/commands.js';
import { registerProjectCommands } from '../projects/commands.js';
import { registerWorkshopCommands } from '../workshop/commands.js';

let installed = false;

export function installCommands() {
  if (installed) return;
  installed = true;
  registerEditorCommands();
  registerPreviewCommands();
  registerProjectCommands();
  registerWorkshopCommands();
  registerExportCommands();
  registerAiCommands();
}
