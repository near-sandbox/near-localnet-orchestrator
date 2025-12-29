/**
 * Git repository management utilities
 */
import { Logger } from './Logger';
export interface RepoInfo {
    name: string;
    url: string;
    branch: string;
    localPath: string;
}
export declare class GitManager {
    private logger;
    private executor;
    private workspaceRoot;
    constructor(workspaceRoot: string, logger?: Logger);
    /**
     * Ensure a repository is cloned and up to date
     * Supports both git URLs and local file:// paths
     */
    ensureRepo(repoUrl: string, branch?: string, repoName?: string): Promise<string>;
    /**
     * Clone a repository
     */
    private cloneRepo;
    /**
     * Update an existing repository
     */
    private updateRepo;
    /**
     * Verify repository health and run setup commands
     */
    private verifyRepo;
    /**
     * Setup Node.js project (install dependencies)
     */
    private setupNodeProject;
    /**
     * Setup Rust project (verify toolchain)
     */
    private setupRustProject;
    /**
     * Get repository information
     */
    getRepoInfo(localPath: string): Promise<RepoInfo | null>;
    /**
     * Extract repository name from URL
     */
    private extractRepoName;
    /**
     * Clean up repository (remove node_modules, etc.)
     */
    cleanRepo(localPath: string): Promise<void>;
    /**
     * Get workspace root path
     */
    getWorkspaceRoot(): string;
}
//# sourceMappingURL=GitManager.d.ts.map