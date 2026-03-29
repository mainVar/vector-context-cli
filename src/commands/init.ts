import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';

const VCTX_MARKER_START = '<!-- vctx -->';
const VCTX_MARKER_END = '<!-- /vctx -->';

interface InitOptions {
    skillOnly?: boolean;
    agentsOnly?: boolean;
    force?: boolean;
}

function getTemplatesDir(): string {
    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
        path.resolve(thisDir, '..', '..', 'templates'),
        path.resolve(thisDir, '..', 'templates'),
    ];
    for (const dir of candidates) {
        if (fs.existsSync(dir)) {
            return dir;
        }
    }
    throw new Error(
        `Templates directory not found. Searched:\n${candidates.map(c => `  - ${c}`).join('\n')}`
    );
}

function resolveProjectDir(argsPath?: string): string {
    if (argsPath) {
        return path.resolve(argsPath);
    }
    return process.cwd();
}

function createSkillFile(projectDir: string, force: boolean): boolean {
    const skillDir = path.join(projectDir, '.opencode', 'skills', 'vector-context-cli');
    const skillFile = path.join(skillDir, 'SKILL.md');

    if (fs.existsSync(skillFile) && !force) {
        console.log(chalk.yellow('  Skill file already exists:'), chalk.gray(skillFile));
        console.log(chalk.gray('  Use --force to overwrite'));
        return false;
    }

    const templatesDir = getTemplatesDir();
    const templatePath = path.join(templatesDir, 'SKILL.md');

    if (!fs.existsSync(templatePath)) {
        throw new Error(`SKILL.md template not found: ${templatePath}`);
    }

    fs.mkdirSync(skillDir, { recursive: true });
    fs.copyFileSync(templatePath, skillFile);
    console.log(chalk.green('  Created:'), chalk.white(skillFile));
    return true;
}

function updateAgentsFile(projectDir: string, force: boolean): boolean {
    const agentsFile = path.join(projectDir, 'AGENTS.md');
    const templatesDir = getTemplatesDir();
    const agentsTemplatePath = path.join(templatesDir, 'AGENTS.md');

    if (!fs.existsSync(agentsTemplatePath)) {
        throw new Error(`AGENTS.md template not found: ${agentsTemplatePath}`);
    }

    const vctxSection = fs.readFileSync(agentsTemplatePath, 'utf-8').trim();

    if (!fs.existsSync(agentsFile)) {
        const content = `# Project Guidelines\n\n${vctxSection}\n`;
        fs.writeFileSync(agentsFile, content, 'utf-8');
        console.log(chalk.green('  Created:'), chalk.white(agentsFile));
        return true;
    }

    const existing = fs.readFileSync(agentsFile, 'utf-8');
    const startIdx = existing.indexOf(VCTX_MARKER_START);
    const endIdx = existing.indexOf(VCTX_MARKER_END);

    if (startIdx !== -1 && endIdx !== -1) {
        if (!force) {
            console.log(chalk.yellow('  AGENTS.md already has vctx section'));
            console.log(chalk.gray('  Use --force to overwrite'));
            return false;
        }
        const before = existing.substring(0, startIdx);
        const after = existing.substring(endIdx + VCTX_MARKER_END.length);
        const updated = `${before}${vctxSection}${after}`;
        fs.writeFileSync(agentsFile, updated, 'utf-8');
        console.log(chalk.green('  Updated:'), chalk.white(agentsFile));
        return true;
    }

    const separator = existing.endsWith('\n') ? '\n' : '\n\n';
    const updated = `${existing}${separator}${vctxSection}\n`;
    fs.writeFileSync(agentsFile, updated, 'utf-8');
    console.log(chalk.green('  Updated:'), chalk.white(agentsFile));
    return true;
}

export function initCommand(projectPath?: string, options: InitOptions = {}): void {
    const projectDir = resolveProjectDir(projectPath);

    if (!fs.existsSync(projectDir)) {
        console.log(chalk.red('Error: Project directory not found:'), projectDir);
        process.exit(1);
    }

    console.log(chalk.bold('\n  vctx init - Setting up AI integration\n'));
    console.log(chalk.gray('  Project:'), chalk.white(projectDir));
    console.log();

    const { skillOnly, agentsOnly, force } = options;

    if (!agentsOnly) {
        createSkillFile(projectDir, force ?? false);
    }

    if (!skillOnly) {
        updateAgentsFile(projectDir, force ?? false);
    }

    console.log();
    console.log(chalk.bold('  Next steps:'));
    console.log(chalk.gray('  1. Start Qdrant:  ') + 'docker run -p 6333:6333 qdrant/qdrant');
    console.log(chalk.gray('  2. Start LM Studio with an embedding model'));
    console.log(chalk.gray('  3. Add project:   ') + `vctx add . --preset <preset>`);
    console.log(chalk.gray('  4. Index:         ') + 'vctx index .');
    console.log();
}
