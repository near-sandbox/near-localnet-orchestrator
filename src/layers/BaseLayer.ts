/**
 * Abstract base class for all layer implementations
 */

import * as path from 'path';
import { Logger } from '../utils/Logger';
import { GitManager } from '../utils/GitManager';
import { HealthChecker } from '../utils/HealthChecker';
import { CdkManager } from '../aws/CdkManager';
import { StackOutputReader } from '../aws/StackOutputReader';
import { CommandExecutor } from '../utils/CommandExecutor';
import { ConfigManager } from '../config/ConfigManager';
import {
  LayerConfig,
  GlobalConfig,
  LayerOutput,
  VerifyResult,
  DeployResult,
} from '../types';

export interface LayerContext {
  globalConfig: GlobalConfig;
  layerConfig: LayerConfig;
  configManager: ConfigManager;
  logger: Logger;
  gitManager: GitManager;
  healthChecker: HealthChecker;
  cdkManager: CdkManager;
  stackReader: StackOutputReader;
  commandExecutor: CommandExecutor;
  getLayerOutputs: (layerName: string) => LayerOutput | undefined;
}

export abstract class BaseLayer {
  protected context: LayerContext;
  protected layerName: string;

  constructor(layerName: string, context: LayerContext) {
    this.layerName = layerName;
    this.context = context;
  }

  /**
   * Get the layer name
   */
  getLayerName(): string {
    return this.layerName;
  }

  /**
   * Get the layer configuration
   */
  getLayerConfig(): LayerConfig {
    return this.context.layerConfig;
  }

  /**
   * Get the global configuration
   */
  getGlobalConfig(): GlobalConfig {
    return this.context.globalConfig;
  }

  /**
   * Verify if this layer is already healthy/running
   * Returns a result indicating whether deployment should be skipped
   */
  abstract verify(): Promise<VerifyResult>;

  /**
   * Deploy this layer
   * Should handle all deployment logic specific to this layer
   */
  abstract deploy(): Promise<DeployResult>;

  /**
   * Get outputs from this layer after deployment
   * Returns structured output data that other layers can consume
   */
  abstract getOutputs(): Promise<LayerOutput>;

  /**
   * Destroy this layer
   * Should clean up all resources created by this layer
   */
  abstract destroy(): Promise<{ success: boolean; error?: string }>;

  /**
   * Get dependencies for this layer
   */
  getDependencies(): string[] {
    return this.context.layerConfig.depends_on || [];
  }

  /**
   * Check if this layer is enabled
   */
  isEnabled(): boolean {
    return this.context.layerConfig.enabled;
  }

  /**
   * Helper method to run a health check on a URL
   */
  protected async runHealthCheck(url: string, type: 'rpc' | 'http' | 'mpc' = 'http', options?: any): Promise<boolean> {
    try {
      let result;
      if (type === 'rpc') {
        result = await this.context.healthChecker.checkRpc(url, options?.expectedNetworkId);
      } else if (type === 'mpc') {
        result = await this.context.healthChecker.checkMpcNode(
          url,
          options?.nearRpcUrl,
          options?.expectedContractId
        );
      } else {
        result = await this.context.healthChecker.checkHttp(url, options);
      }
      return result.healthy;
    } catch (error) {
      this.context.logger.debug(`Health check failed for ${url}:`, error);
      return false;
    }
  }

  /**
   * Helper method to read CloudFormation stack outputs
   */
  protected async readStackOutputs(stackName: string): Promise<Record<string, string>> {
    const result = await this.context.stackReader.readStackOutputs(
      stackName,
      {
        profile: this.context.globalConfig.aws_profile,
        region: this.context.globalConfig.aws_region,
      }
    );

    if (!result.success) {
      throw new Error(`Failed to read stack outputs for ${stackName}: ${result.error}`);
    }

    return result.outputs;
  }

  /**
   * Helper method to get outputs from a dependency layer
   */
  protected getDependencyOutputs(dependencyName: string): LayerOutput | undefined {
    return this.context.getLayerOutputs(dependencyName);
  }

  /**
   * Helper method to ensure a repository is cloned and ready
   */
  protected async ensureRepository(repoUrl: string, branch?: string): Promise<string> {
    const repoName = this.extractRepoName(repoUrl);
    const localPath = await this.context.gitManager.ensureRepo(
      repoUrl,
      branch || this.context.layerConfig.source.branch,
      repoName
    );

    // Change to repository directory and verify it's ready
    const originalCwd = this.context.commandExecutor.getCwd();
    try {
      this.context.commandExecutor.setCwd(localPath);

      // If it's a CDK project, ensure dependencies are installed
      if (this.context.layerConfig.source.cdk_path) {
        const cdkPath = this.context.layerConfig.source.cdk_path;
        const fullCdkPath = cdkPath.startsWith('/') ? cdkPath : cdkPath;

        if (this.fileExists(path.join(localPath, fullCdkPath, 'package.json'))) {
          this.context.logger.info(`Installing CDK dependencies in ${fullCdkPath}`);
          await this.context.commandExecutor.execute('npm', ['install'], {
            cwd: path.join(localPath, fullCdkPath),
            streamOutput: false,
          });
        }
      }

    } finally {
      this.context.commandExecutor.setCwd(originalCwd);
    }

    return localPath;
  }

  /**
   * Helper method to deploy CDK stacks for this layer
   */
  protected async deployCdkStacks(
    repoPath: string,
    cdkRelativePath: string,
    options: {
      stacks?: string[];
      context?: Record<string, string>;
    } = {}
  ): Promise<DeployResult> {
    const cdkPath = path.join(repoPath, cdkRelativePath);

    this.context.logger.info(`Deploying CDK stacks in ${cdkPath}`);

    const result = await this.context.cdkManager.deploy(cdkPath, {
      profile: this.context.globalConfig.aws_profile,
      region: this.context.globalConfig.aws_region,
      stacks: options.stacks,
      context: options.context,
      requireApproval: 'never',
    });

    if (!result.success) {
      throw new Error(`CDK deployment failed: ${result.error}`);
    }

    return result;
  }

  /**
   * Helper method to execute a script in a repository
   */
  protected async executeScript(
    repoPath: string,
    scriptPath: string,
    options: {
      args?: string[];
      env?: Record<string, string>;
      cwd?: string;
    } = {}
  ): Promise<{ success: boolean; stdout: string; stderr: string; error?: string }> {
    const fullScriptPath = path.join(repoPath, scriptPath);
    const scriptName = path.basename(fullScriptPath);

    this.context.logger.info(`Executing script: ${fullScriptPath}`);

    const runnerCwd = options.cwd || repoPath;
    const extraArgs = options.args || [];

    // Choose execution strategy based on file extension
    let command = 'node';
    let args: string[] = [];

    if (scriptName.endsWith('.sh')) {
      command = 'bash';
      args = [fullScriptPath, ...extraArgs];
    } else if (scriptName.endsWith('.ts')) {
      command = 'node';
      args = ['-r', 'ts-node/register', fullScriptPath, ...extraArgs];
    } else if (scriptName.endsWith('.js')) {
      command = 'node';
      args = [fullScriptPath, ...extraArgs];
    } else {
      // Fallback: attempt to run via node (historical behavior)
      command = 'node';
      args = ['-r', 'ts-node/register', fullScriptPath, ...extraArgs];
    }

    const result = await this.context.commandExecutor.execute(
      command,
      args,
      {
        cwd: runnerCwd,
        env: { ...(process.env as Record<string, string>), ...options.env },
        streamOutput: true,
      }
    );

    if (!result.success) {
      return {
        success: false,
        stdout: result.stdout,
        stderr: result.stderr,
        error: `Script execution failed with exit code ${result.exitCode}`,
      };
    }

    return {
      success: true,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  /**
   * Helper method to write a JSON config file
   */
  protected async writeConfigFile(filePath: string, config: any): Promise<void> {
    const fs = require('fs');
    const dir = path.dirname(filePath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
    this.context.logger.debug(`Wrote config file: ${filePath}`);
  }

  /**
   * Helper method to check if a file exists
   */
  protected fileExists(filePath: string): boolean {
    const fs = require('fs');
    try {
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  /**
   * Extract repository name from URL
   */
  protected extractRepoName(repoUrl: string): string {
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
   * Create a standardized LayerOutput
   */
  protected createLayerOutput(outputs: Record<string, string>): LayerOutput {
    return {
      layer_name: this.layerName,
      deployed: true,
      outputs,
      timestamp: new Date().toISOString(),
    };
  }
}
