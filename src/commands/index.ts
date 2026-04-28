import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { configManager } from '../config/manager.js';
import { createEmbedding, createVectorDatabase } from '../utils/embedding.js';
import { updateSnapshotIndexed, updateSnapshotFailed } from '../utils/snapshot.js';
import { 
    Context, 
    ContextConfig, 
    logger
} from '@vector-context/core';

export interface IndexCommandOptions {
    force?: boolean;
    verbose?: boolean;
}

export async function indexCommand(projectPath: string | undefined, options: IndexCommandOptions = {}): Promise<void> {
    if (projectPath) {
        await indexSingleProject(projectPath, options);
    } else {
        const projects = configManager.getEnabledProjects();
        
        if (projects.length === 0) {
            console.log(chalk.yellow('No enabled projects to index.'));
            console.log(chalk.gray('Use "vctx add <path>" to add projects.'));
            return;
        }
        
        console.log(chalk.bold(`\nIndexing ${projects.length} project(s)...\n`));
        
        for (const project of projects) {
            await indexSingleProject(project.path, options);
        }
    }
}

async function indexSingleProject(projectPath: string, options: IndexCommandOptions): Promise<void> {
    const absolutePath = path.resolve(projectPath);
    const project = configManager.getProject(absolutePath);
    
    if (!project) {
        console.log(chalk.yellow(`Project not found in config: ${absolutePath}`));
        console.log(chalk.gray('Use "vctx add <path>" to add it first.'));
        return;
    }
    
    if (!project.enabled) {
        console.log(chalk.gray(`Skipping disabled project: ${project.name}`));
        return;
    }
    
    const spinner = ora(`Indexing ${project.name}...`).start();
    
    try {
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
        
        const stats = await context.indexCodebase(
            absolutePath,
            (progress) => {
                if (options.verbose) {
                    spinner.text = `Indexing ${project.name}: ${progress.phase} (${progress.percentage}%)`;
                } else {
                    spinner.text = `Indexing ${project.name}: ${progress.percentage}%`;
                }
            },
            options.force
        );
        
        spinner.succeed(chalk.green(`✓ Indexed ${project.name}`));
        
        console.log(chalk.gray(`  Files: ${stats.indexedFiles}`));
        console.log(chalk.gray(`  Chunks: ${stats.totalChunks}`));
        
        updateSnapshotIndexed(absolutePath, stats.indexedFiles, stats.totalChunks);
        
        configManager.updateProject(absolutePath, {
            lastIndexed: new Date().toISOString(),
        });
        
    } catch (error: any) {
        spinner.fail(chalk.red(`✗ Failed to index ${project.name}`));
        console.log(chalk.red(`  Error: ${error.message}`));
        updateSnapshotFailed(absolutePath, error.message);
    }
}
