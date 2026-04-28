#!/usr/bin/env node

import meow from 'meow';
import chalk from 'chalk';
import { addCommand } from './commands/add.js';
import { removeCommand } from './commands/remove.js';
import { listCommand } from './commands/list.js';
import { statusCommand } from './commands/status.js';
import { indexCommand } from './commands/index.js';
import { searchCommand } from './commands/search.js';
import { ignoreCommand, setIgnoreOptions } from './commands/ignore.js';
import { presetCommand, listPresets } from './commands/preset.js';
import { watchCommand } from './commands/watch.js';
import { initCommand } from './commands/init.js';
import { getPresetDescriptions } from './presets/types.js';
import { runTUI } from './tui/index.js';

const cli = meow(`
${chalk.bold('Usage')}
  $ vctx <command> [options]

${chalk.bold('Commands')}
  interactive, i    Run interactive TUI mode (default)
  init              Initialize AI integration (create SKILL.md and AGENTS.md)
  watch, w          Watch projects and auto-reindex on changes
  add <path>        Add a project to config
  remove <path>     Remove a project from config
  list              List all configured projects
  index [path]      Index project(s)
  search <path> <query>   Semantic search in an indexed project
  status [path]     Show indexing status
  ignore <path> <add|remove|list> [pattern]  Manage ignore patterns
  preset <path> [name]   Set or view project preset
  presets           List available presets

${chalk.bold('Options')}
  --preset <name>   Preset for add command (unity, node, python, rust, go, java, web, minimal)
  --name <name>     Custom name for project
  --ignore <pattern> Add ignore pattern (can be used multiple times)
  --force           Force re-index
  --verbose         Show detailed output
  --all             Show all patterns
  --skill-only      Init: create only SKILL.md
  --agents-only     Init: create only AGENTS.md
  --disabled        Add project as disabled
  --enabled         Filter to show only enabled projects
  --limit <n>       search: max results (default 10, max 50)
  --threshold <n>   search: min similarity score 0..1 (default 0.3)
  --extensions <ext> search: filter by file extension(s), repeatable (e.g. -e .cs -e .shader)
  --json            search: output raw JSON
  --help            Show this help
  --version         Show version

${chalk.bold('Examples')}
  $ vctx add ./my-project --preset node
  $ vctx add ./unity-game --preset unity --ignore "Library/**"
  $ vctx index ./my-project
  $ vctx search ./my-project "function that handles user authentication"
  $ vctx search ./my-project "player movement" --limit 5 -e .cs
  $ vctx status
  $ vctx ignore ./my-project add "*.test.ts"
`, {
    importMeta: import.meta,
    flags: {
        preset: { type: 'string', short: 'p' },
        name: { type: 'string', short: 'n' },
        ignore: { type: 'string', isMultiple: true, short: 'i' },
        extensions: { type: 'string', isMultiple: true, short: 'e' },
        force: { type: 'boolean', short: 'f' },
        verbose: { type: 'boolean', short: 'v' },
        all: { type: 'boolean', short: 'a' },
        skillOnly: { type: 'boolean' },
        agentsOnly: { type: 'boolean' },
        disabled: { type: 'boolean', short: 'd' },
        enabled: { type: 'boolean' },
        limit: { type: 'number', short: 'l' },
        threshold: { type: 'number' },
        json: { type: 'boolean' },
    },
});

async function main(): Promise<void> {
    const { input, flags } = cli;
    const command = input[0] || 'interactive';

    switch (command) {
        case 'init':
            initCommand(input[1], {
                skillOnly: flags.skillOnly,
                agentsOnly: flags.agentsOnly,
                force: flags.force,
            });
            break;

        case 'interactive':
        case 'i':
            await runTUI();
            break;

        case 'add':
            if (!input[1]) {
                console.log(chalk.red('Error: Project path is required'));
                console.log(chalk.gray('Usage: vctx add <path>'));
                process.exit(1);
            }
            addCommand(input[1], {
                preset: flags.preset,
                name: flags.name,
                ignore: flags.ignore,
                extensions: flags.extensions,
                disabled: flags.disabled,
            });
            break;

        case 'remove':
        case 'rm':
            if (!input[1]) {
                console.log(chalk.red('Error: Project path is required'));
                console.log(chalk.gray('Usage: vctx remove <path>'));
                process.exit(1);
            }
            removeCommand(input[1]);
            break;

        case 'list':
        case 'ls':
            listCommand({
                all: flags.all,
                enabled: flags.enabled,
                disabled: flags.disabled,
            });
            break;

        case 'index':
            await indexCommand(input[1], {
                force: flags.force,
                verbose: flags.verbose,
            });
            break;

        case 'search':
        case 's':
            if (!input[1] || !input[2]) {
                console.log(chalk.red('Error: Project path and query are required'));
                console.log(chalk.gray('Usage: vctx search <path> <query>'));
                process.exit(1);
            }
            await searchCommand(input[1], input.slice(2).join(' '), {
                limit: flags.limit,
                threshold: flags.threshold,
                extensions: flags.extensions,
                json: flags.json,
            });
            break;

        case 'status':
            statusCommand(input[1]);
            break;

        case 'ignore':
            if (!input[1]) {
                console.log(chalk.red('Error: Project path is required'));
                console.log(chalk.gray('Usage: vctx ignore <path> <add|remove|list> [pattern]'));
                process.exit(1);
            }
            setIgnoreOptions({ showAll: flags.all });
            ignoreCommand(input[1], input[2] as any || 'list', input[3]);
            break;

        case 'preset':
            if (!input[1]) {
                console.log(chalk.red('Error: Project path is required'));
                console.log(chalk.gray('Usage: vctx preset <path> [name]'));
                process.exit(1);
            }
            presetCommand(input[1], input[2]);
            break;

        case 'presets':
            listPresets();
            break;

        case 'watch':
        case 'w':
            await watchCommand();
            break;

        default:
            console.log(chalk.red(`Unknown command: ${command}`));
            console.log(chalk.gray('Run "vctx --help" for usage information'));
            process.exit(1);
    }
}

main().catch(error => {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
});
