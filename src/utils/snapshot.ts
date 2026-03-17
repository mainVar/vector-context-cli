import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export const SNAPSHOT_FILE = 'mcp-codebase-snapshot.json';

export interface SnapshotInfo {
    status: 'indexed' | 'indexing' | 'indexfailed';
    indexedFiles?: number;
    totalChunks?: number;
    indexingPercentage?: number;
    errorMessage?: string;
    lastUpdated?: string;
    indexStatus?: 'completed' | 'limit_reached';
}

export interface Snapshot {
    formatVersion: string;
    codebases: Record<string, SnapshotInfo>;
    lastUpdated: string;
}

export function getSnapshotPath(): string {
    const contextDir = path.join(os.homedir(), '.context');
    return path.join(contextDir, SNAPSHOT_FILE);
}

export function loadSnapshot(): Snapshot {
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

export function saveSnapshot(snapshot: Snapshot): void {
    const snapshotPath = getSnapshotPath();
    const contextDir = path.dirname(snapshotPath);
    if (!fs.existsSync(contextDir)) {
        fs.mkdirSync(contextDir, { recursive: true });
    }
    snapshot.lastUpdated = new Date().toISOString();
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
}

export function updateSnapshotIndexed(codebasePath: string, indexedFiles: number, totalChunks: number): void {
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

export function updateSnapshotFailed(codebasePath: string, errorMessage: string): void {
    const snapshot = loadSnapshot();
    snapshot.codebases[codebasePath] = {
        status: 'indexfailed',
        errorMessage,
        lastUpdated: new Date().toISOString()
    };
    saveSnapshot(snapshot);
}
