import { installCommands } from './commands/catalog.js';
import { startPlatform } from './platform.js';
import './style.css';

installCommands();
startPlatform(document.getElementById('app'));
