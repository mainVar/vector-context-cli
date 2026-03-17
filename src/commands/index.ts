import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import { configManager } from '../config/manager.js';

const SNAPSHOT_FILE = 'mcp-codebase-snapshot.json';

function getSnapshotPath(): string {
    const contextDir = path.join(os.homedir(), '.context');
    return path.join(contextDir, SNAPSHOT_FILE);
}

interface SnapshotInfo {
    status: 'indexed' | 'indexing' | 'indexfailed';
    indexedFiles?: number;
    totalChunks?: number;
    indexingPercentage?: number;
    errorMessage?: string;
    lastUpdated?: string;
    indexStatus?: 'completed' | 'limit_reached';
}

interface Snapshot {
    formatVersion: string;
    codebases: Record<string, SnapshotInfo>;
    lastUpdated: string;
}

function loadSnapshot(): Snapshot {
    const snapshotPath = getSnapshotPath();
    try {
        if (fs.existsSync(snapshotPath)) {
            const data = fs.readFileSync(snapshotPath, 'utf8');
            const snapshot = JSON.parse(data);
            if (snapshot.formatVersion === 'v2' && snapshot.codebases) {
                return snapshot;
            }
        }
    } catch {
        // ignore errors
    }
    return {
        formatVersion: 'v2',
        codebases: {},
        lastUpdated: new Date().toISOString()
    };
}

function saveSnapshot(snapshot: Snapshot): void {
    const snapshotPath = getSnapshotPath();
    const contextDir = path.dirname(snapshotPath);
    if (!fs.existsSync(contextDir)) {
        fs.mkdirSync(contextDir, { recursive: true });
    }
    snapshot.lastUpdated = new Date().toISOString();
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
}

function updateSnapshotIndexed(codebasePath: string, indexedFiles: number, totalChunks: number): void {
    const snapshot = loadSnapshot();
    snapshot.codebases[codebasePath] = {
        status: 'indexed',
        indexedFiles,
        totalChunks,
        indexStatus: 'completed',
        lastUpdated: new Date().toISOString()
    };
    saveSnapshot(snapshot);
}

function updateSnapshotFailed(codebasePath: string, errorMessage: string): void {
    const snapshot = loadSnapshot();
    snapshot.codebases[codebasePath] = {
        status: 'indexfailed',
        errorMessage,
        lastUpdated: new Date().toISOString()
    };
    saveSnapshot(snapshot);
}
import { 
    Context, 
    ContextConfig, 
    QdrantVectorDB, 
    MilvusVectorDatabase,
    OpenAIEmbedding,
    VoyageAIEmbedding,
    GeminiEmbedding,
    OllamaEmbedding,
    LMStudioEmbedding,
    envManager,
    logger
} from '@vector-context/core';

export interface IndexCommandOptions {
    force?: boolean;
    verbose?: boolean;
}

function createEmbedding() {
    const provider = envManager.get('EMBEDDING_PROVIDER') || 'LMStudio';
    const model = envManager.get('EMBEDDING_MODEL');
    
    switch (provider) {
        case 'OpenAI':
            return new OpenAIEmbedding({
                apiKey: envManager.get('OPENAI_API_KEY') || '',
                model: model || 'text-embedding-3-small',
                ...(envManager.get('OPENAI_BASE_URL') && { baseURL: envManager.get('OPENAI_BASE_URL') }),
            });
        case 'VoyageAI':
            return new VoyageAIEmbedding({
                apiKey: envManager.get('VOYAGEAI_API_KEY') || '',
                model: model || 'voyage-code-3',
            });
        case 'Gemini':
            return new GeminiEmbedding({
                apiKey: envManager.get('GEMINI_API_KEY') || '',
                model: model || 'gemini-embedding-001',
                ...(envManager.get('GEMINI_BASE_URL') && { baseURL: envManager.get('GEMINI_BASE_URL') }),
            });
        case 'Ollama':
            return new OllamaEmbedding({
                model: model || envManager.get('OLLAMA_MODEL') || 'nomic-embed-text',
                host: envManager.get('OLLAMA_HOST') || 'http://127.0.0.1:11434',
            });
        case 'LMStudio':
        default:
            return new LMStudioEmbedding({
                model: model || 'text-embedding-nomic-embed-text-v1.5',
                baseURL: envManager.get('LMSTUDIO_BASE_URL') || 'http://localhost:1234/v1',
            });
    }
}

function createVectorDatabase() {
    const provider = envManager.get('VECTOR_STORE_PROVIDER') || 'Qdrant';
    
    if (provider === 'Qdrant') {
        return new QdrantVectorDB(envManager.get('QDRANT_ADDRESS') || 'http://localhost:6333');
    } else {
        return new MilvusVectorDatabase({
            address: envManager.get('MILVUS_ADDRESS'),
            ...(envManager.get('MILVUS_TOKEN') && { token: envManager.get('MILVUS_TOKEN') }),
        });
    }
}

function createContext(): Context {
    const embedding = createEmbedding();
    const vectorDatabase = createVectorDatabase();
    
    return new Context({
        embedding,
        vectorDatabase,
    });
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
        
        const contextConfig: ContextConfig = {
            ignorePatterns,
            customExtensions,
            customIgnorePatterns: project.customIgnore,
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
