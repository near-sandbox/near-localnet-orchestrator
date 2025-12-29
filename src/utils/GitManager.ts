/**
 * Git repository management utilities
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './Logger';
import { CommandExecutor } from './CommandExecutor';

export interface RepoInfo {
  name: string;
  url: string;
  branch: string;
  localPath: string;
}

export class GitManager {
  private logger: Logger;
  private executor: CommandExecutor;
  private workspaceRoot: string;

  constructor(workspaceRoot: string, logger?: Logger) {
    this.workspaceRoot = workspaceRoot;
    this.logger = logger || new Logger('GitManager');
    this.executor = new CommandExecutor(this.logger);
  }

  /**
   * Ensure a repository is cloned and up to date
   * Supports both git URLs and local file:// paths
   */
  async ensureRepo(repoUrl: string, branch: string = 'main', repoName?: string): Promise<string> {
    // Handle local file:// URLs - just return the local path
    if (repoUrl.startsWith('file://')) {
      const localSourcePath = repoUrl.replace('file://', '');
      this.logger.info(`Using local repository: ${localSourcePath}`);
      
      if (!fs.existsSync(localSourcePath)) {
        throw new Error(`Local repository not found: ${localSourcePath}`);
      }
      
      // Verify the repository is healthy
      await this.verifyRepo(localSourcePath);
      
      this.logger.success(`Local repository ready: ${localSourcePath}`);
      return localSourcePath;
    }

    const name = repoName || this.extractRepoName(repoUrl);
    const localPath = path.join(this.workspaceRoot, name);

    this.logger.info(`Ensuring repository: ${name} (${repoUrl})`);

    if (fs.existsSync(localPath)) {
      // Repository exists, update it
      await this.updateRepo(localPath, branch);
    } else {
      // Repository doesn't exist, clone it
      await this.cloneRepo(repoUrl, localPath, branch);
    }

    // Verify the repository is healthy
    await this.verifyRepo(localPath);

    this.logger.success(`Repository ready: ${name}`);
    return localPath;
  }

  /**
   * Clone a repository
   */
  private async cloneRepo(repoUrl: string, localPath: string, branch: string): Promise<void> {
    this.logger.info(`Cloning repository: ${repoUrl} -> ${localPath}`);

    // Ensure parent directory exists
    const parentDir = path.dirname(localPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const result = await this.executor.execute('git', ['clone', '--branch', branch, repoUrl, localPath]);

    if (!result.success) {
      throw new Error(`Failed to clone repository: ${result.stderr}`);
    }

    this.logger.success(`Cloned repository to ${localPath}`);
  }

  /**
   * Update an existing repository
   */
  private async updateRepo(localPath: string, branch: string): Promise<void> {
    this.logger.info(`Updating repository at ${localPath}`);

    // Change to repo directory
    const originalCwd = this.executor.getCwd();
    this.executor.setCwd(localPath);

    try {
      // Fetch latest changes
      const fetchResult = await this.executor.execute('git', ['fetch', 'origin'], { cwd: localPath });
      if (!fetchResult.success) {
        throw new Error(`Failed to fetch: ${fetchResult.stderr}`);
      }

      // Checkout the desired branch
      const checkoutResult = await this.executor.execute('git', ['checkout', branch], { cwd: localPath });
      if (!checkoutResult.success) {
        throw new Error(`Failed to checkout branch ${branch}: ${checkoutResult.stderr}`);
      }

      // Reset to origin branch (hard reset to ensure clean state)
      const resetResult = await this.executor.execute('git', ['reset', '--hard', `origin/${branch}`], { cwd: localPath });
      if (!resetResult.success) {
        throw new Error(`Failed to reset to origin/${branch}: ${resetResult.stderr}`);
      }

      this.logger.success(`Updated repository to latest ${branch}`);

    } finally {
      // Restore original working directory
      this.executor.setCwd(originalCwd);
    }
  }

  /**
   * Verify repository health and run setup commands
   */
  private async verifyRepo(localPath: string): Promise<void> {
    this.logger.debug(`Verifying repository at ${localPath}`);

    // Check if it's a valid git repository
    if (!fs.existsSync(path.join(localPath, '.git'))) {
      throw new Error(`Not a valid git repository: ${localPath}`);
    }

    // Check for package.json (Node.js project)
    const packageJsonPath = path.join(localPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      await this.setupNodeProject(localPath);
    }

    // Check for Cargo.toml (Rust project)
    const cargoTomlPath = path.join(localPath, 'Cargo.toml');
    if (fs.existsSync(cargoTomlPath)) {
      await this.setupRustProject(localPath);
    }
  }

  /**
   * Setup Node.js project (install dependencies)
   */
  private async setupNodeProject(localPath: string): Promise<void> {
    this.logger.info(`Setting up Node.js project at ${localPath}`);

    const originalCwd = this.executor.getCwd();
    this.executor.setCwd(localPath);

    try {
      // Check if node_modules exists
      if (!fs.existsSync(path.join(localPath, 'node_modules'))) {
        this.logger.info('Installing npm dependencies...');

        const installResult = await this.executor.execute('npm', ['install'], {
          cwd: localPath,
          streamOutput: true,
        });

        if (!installResult.success) {
          this.logger.warn(`npm install failed, but continuing: ${installResult.stderr}`);
        } else {
          this.logger.success('npm dependencies installed');
        }
      } else {
        this.logger.debug('node_modules already exists, skipping npm install');
      }
    } finally {
      this.executor.setCwd(originalCwd);
    }
  }

  /**
   * Setup Rust project (verify toolchain)
   */
  private async setupRustProject(localPath: string): Promise<void> {
    this.logger.info(`Setting up Rust project at ${localPath}`);

    const originalCwd = this.executor.getCwd();
    this.executor.setCwd(localPath);

    try {
      // Check if Rust is available
      const rustcCheck = await this.executor.execute('rustc', ['--version'], {
        cwd: localPath,
        silent: true,
      });

      if (!rustcCheck.success) {
        this.logger.warn('Rust toolchain not found, but continuing');
      } else {
        this.logger.debug('Rust toolchain available');
      }
    } finally {
      this.executor.setCwd(originalCwd);
    }
  }

  /**
   * Get repository information
   */
  async getRepoInfo(localPath: string): Promise<RepoInfo | null> {
    try {
      const originalCwd = this.executor.getCwd();
      this.executor.setCwd(localPath);

      // Get remote URL
      const remoteResult = await this.executor.execute('git', ['remote', 'get-url', 'origin'], { silent: true });
      if (!remoteResult.success) {
        return null;
      }

      // Get current branch
      const branchResult = await this.executor.execute('git', ['branch', '--show-current'], { silent: true });
      if (!branchResult.success) {
        return null;
      }

      const url = remoteResult.stdout.trim();
      const branch = branchResult.stdout.trim();
      const name = this.extractRepoName(url);

      return {
        name,
        url,
        branch,
        localPath,
      };

    } catch {
      return null;
    } finally {
      // Note: We don't restore CWD here as it might be called in different contexts
    }
  }

  /**
   * Extract repository name from URL
   */
  private extractRepoName(repoUrl: string): string {
    // Handle different URL formats:
    // https://github.com/user/repo.git -> repo
    // git@github.com:user/repo.git -> repo
    const match = repoUrl.match(/\/([^\/]+?)(\.git)?$/);
    if (match) {
      return match[1];
    }

    // Fallback: use last part of URL
    const parts = repoUrl.split('/');
    return parts[parts.length - 1].replace('.git', '');
  }

  /**
   * Clean up repository (remove node_modules, etc.)
   */
  async cleanRepo(localPath: string): Promise<void> {
    this.logger.info(`Cleaning repository at ${localPath}`);

    const cleanPaths = [
      'node_modules',
      'target', // Rust build artifacts
      'dist',
      'build',
      '.next',
    ];

    for (const cleanPath of cleanPaths) {
      const fullPath = path.join(localPath, cleanPath);
      if (fs.existsSync(fullPath)) {
        this.logger.debug(`Removing ${cleanPath}...`);
        fs.rmSync(fullPath, { recursive: true, force: true });
      }
    }

    this.logger.success(`Cleaned repository: ${localPath}`);
  }

  /**
   * Get workspace root path
   */
  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }
}
