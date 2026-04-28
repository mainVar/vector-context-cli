import * as path from 'path';
import chalk from 'chalk';
import { configManager } from '../config/manager.js';
import { createEmbedding, createVectorDatabase } from '../utils/embedding.js';
import { Context, ContextConfig } from '@vector-context/core';

export interface SearchCommandOptions {
    limit?: number;
    threshold?: number;
    extensions?: string[];
    json?: boolean;
}

export async function searchCommand(
    projectPath: string,
    query: string,
    options: SearchCommandOptions = {}
): Promise<void> {
    if (!query || !query.trim()) {
        console.log(chalk.red('Error: Search query is required'));
        console.log(chalk.gray('Usage: vctx search <path> <query>'));
        process.exit(1);
    }

    const absolutePath = path.resolve(projectPath);
    const project = configManager.getProject(absolutePath);

    if (!project) {
        console.log(chalk.yellow(`Project not found in config: ${absolutePath}`));
        console.log(chalk.gray('Use "vctx add <path>" to add it first.'));
        process.exit(1);
    }

    const ignorePatterns = configManager.getEffectiveIgnorePatterns(absolutePath);
    const customExtensions = configManager.getEffectiveExtensions(absolutePath);
    const filenameOnlyExtensions = configManager.getEffectiveFilenameOnlyExtensions(absolutePath);

    const contextConfig: ContextConfig = {
        ignorePatterns,
        customExtensions,
        customIgnorePatterns: project.customIgnore,
        filenameOnlyExtensions,
    };

    const embedding = createEmbedding();
    const vectorDatabase = createVectorDatabase();

    const context = new Context({
        ...contextConfig,
        embedding,
        vectorDatabase,
    });

    const hasIndex = await context.hasIndex(absolutePath);
    if (!hasIndex) {
        console.log(chalk.yellow(`Project is not indexed yet: ${project.name}`));
        console.log(chalk.gray(`Run "vctx index ${projectPath}" first.`));
        process.exit(1);
    }

    const limit = Math.min(Math.max(options.limit ?? 10, 1), 50);
    const threshold = options.threshold ?? 0.3;

    let filterExpr: string | undefined;
    if (options.extensions && options.extensions.length > 0) {
        const cleaned = options.extensions
            .map(e => e.trim())
            .filter(e => e.length > 0)
            .map(e => (e.startsWith('.') ? e : `.${e}`));
        const invalid = cleaned.filter(e => !(e.startsWith('.') && e.length > 1 && !/\s/.test(e)));
        if (invalid.length > 0) {
            console.log(chalk.red(`Error: Invalid extensions: ${invalid.join(', ')}`));
            process.exit(1);
        }
        filterExpr = `fileExtension in [${cleaned.map(e => `'${e}'`).join(', ')}]`;
    }

    let results;
    try {
        results = await context.semanticSearch(absolutePath, query, limit, threshold, filterExpr);
    } catch (error: any) {
        console.log(chalk.red(`Search failed: ${error.message}`));
        process.exit(1);
    }

    if (options.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
    }

    if (results.length === 0) {
        console.log(chalk.yellow(`No results found for: "${query}"`));
        return;
    }

    console.log(chalk.bold(`\nFound ${results.length} result(s) for: "${query}"\n`));

    results.forEach((result, idx) => {
        const score = result.score.toFixed(3);
        const location = result.startLine === result.endLine
            ? `:${result.startLine}`
            : `:${result.startLine}-${result.endLine}`;
        console.log(chalk.bold(`${idx + 1}. ${chalk.cyan(result.relativePath)}${chalk.gray(location)} ${chalk.gray(`[score: ${score}]`)}`));
        if (result.language && result.language !== 'unknown') {
            console.log(chalk.gray(`   Language: ${result.language}`));
        }
        const preview = result.content.length > 400
            ? result.content.slice(0, 400) + '...'
            : result.content;
        const indented = preview.split('\n').map(line => `   ${line}`).join('\n');
        console.log(indented);
        console.log('');
    });
}
