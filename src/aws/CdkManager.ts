/**
 * AWS CDK deployment manager
 */

import * as path from 'path';
import { Logger } from '../utils/Logger';
import { CommandExecutor } from '../utils/CommandExecutor';

export interface CdkDeployOptions {
  profile?: string;
  region?: string;
  stacks?: string[];
  context?: Record<string, string>;
  timeout?: number;
  requireApproval?: 'never' | 'any-change' | 'broadening';
}

export interface CdkDeployResult {
  success: boolean;
  deployedStacks: string[];
  outputs?: Record<string, any>;
  error?: string;
  duration: number;
}

export class CdkManager {
  private logger: Logger;
  private executor: CommandExecutor;

  constructor(logger?: Logger) {
    this.logger = logger || new Logger('CdkManager');
    this.executor = new CommandExecutor(this.logger);
  }

  /**
   * Deploy CDK stacks
   */
  async deploy(
    cdkPath: string,
    options: CdkDeployOptions = {}
  ): Promise<CdkDeployResult> {
    const startTime = Date.now();

    const {
      profile,
      region,
      stacks = [],
      context = {},
      timeout = 1800000, // 30 minutes default
      requireApproval = 'never',
    } = options;

    this.logger.startOperation(`CDK deploy in ${cdkPath}`);

    try {
      // Change to CDK directory
      const originalCwd = this.executor.getCwd();
      this.executor.setCwd(cdkPath);

      // Build the CDK deploy command
      const args = ['deploy'];

      // Add profile if specified
      if (profile) {
        args.push('--profile', profile);
      }

      // Add region if specified
      if (region) {
        args.push('--region', region);
      }

      // Add stacks if specified
      if (stacks.length > 0) {
        args.push(...stacks);
      }

      // Add context variables
      for (const [key, value] of Object.entries(context)) {
        args.push('--context', `${key}=${value}`);
      }

      // Add approval setting
      args.push('--require-approval', requireApproval);

      // Add other common flags
      args.push('--outputs-file', 'cdk-outputs.json');

      this.logger.info(`Running: cdk ${args.join(' ')}`);

      // Execute CDK deploy
      const result = await this.executor.execute('npx', ['cdk', ...args], {
        cwd: cdkPath,
        timeout,
        streamOutput: true,
      });

      const duration = Date.now() - startTime;

      if (result.success) {
        this.logger.completeOperation(`CDK deploy in ${cdkPath}`, duration);

        // Try to read outputs file
        let outputs: Record<string, any> | undefined;
        try {
          const outputsPath = path.join(cdkPath, 'cdk-outputs.json');
          const fs = require('fs');
          if (fs.existsSync(outputsPath)) {
            const outputsContent = fs.readFileSync(outputsPath, 'utf-8');
            outputs = JSON.parse(outputsContent);
          }
        } catch (error) {
          this.logger.warn('Failed to read CDK outputs file', error);
        }

        return {
          success: true,
          deployedStacks: stacks.length > 0 ? stacks : ['all'],
          outputs,
          duration,
        };
      } else {
        this.logger.failOperation(`CDK deploy in ${cdkPath}`, result.stderr);
        return {
          success: false,
          deployedStacks: [],
          error: result.stderr,
          duration,
        };
      }

    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.failOperation(`CDK deploy in ${cdkPath}`, error);
      return {
        success: false,
        deployedStacks: [],
        error: error.message,
        duration,
      };
    }
  }

  /**
   * Destroy CDK stacks
   */
  async destroy(
    cdkPath: string,
    options: {
      profile?: string;
      region?: string;
      stacks?: string[];
      force?: boolean;
      timeout?: number;
    } = {}
  ): Promise<{ success: boolean; destroyedStacks: string[]; error?: string; duration: number }> {
    const startTime = Date.now();

    const {
      profile,
      region,
      stacks = [],
      force = false,
      timeout = 1800000, // 30 minutes default (destroy can take a while due to ENI/VPC dependencies)
    } = options;

    this.logger.startOperation(`CDK destroy in ${cdkPath}`);

    try {
      // Change to CDK directory
      const originalCwd = this.executor.getCwd();
      this.executor.setCwd(cdkPath);

      // Build the CDK destroy command
      const args = ['destroy'];

      // Add profile if specified
      if (profile) {
        args.push('--profile', profile);
      }

      // Add region if specified
      if (region) {
        args.push('--region', region);
      }

      // Add stacks if specified
      if (stacks.length > 0) {
        args.push(...stacks);
      }

      // Add force flag if specified
      if (force) {
        args.push('--force');
      }

      // Add approval setting (always never for destroy)
      args.push('--require-approval', 'never');

      this.logger.info(`Running: cdk ${args.join(' ')}`);

      // Execute CDK destroy
      const result = await this.executor.execute('npx', ['cdk', ...args], {
        cwd: cdkPath,
        streamOutput: true,
        timeout,
      });

      const duration = Date.now() - startTime;

      if (result.success) {
        this.logger.completeOperation(`CDK destroy in ${cdkPath}`, duration);
        return {
          success: true,
          destroyedStacks: stacks.length > 0 ? stacks : ['all'],
          duration,
        };
      } else {
        this.logger.failOperation(`CDK destroy in ${cdkPath}`, result.stderr);
        return {
          success: false,
          destroyedStacks: [],
          error: result.stderr,
          duration,
        };
      }

    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.failOperation(`CDK destroy in ${cdkPath}`, error);
      return {
        success: false,
        destroyedStacks: [],
        error: error.message,
        duration,
      };
    }
  }

  /**
   * Synthesize CDK stacks (validate CloudFormation templates)
   */
  async synth(
    cdkPath: string,
    options: {
      profile?: string;
      region?: string;
      stacks?: string[];
      context?: Record<string, string>;
    } = {}
  ): Promise<{ success: boolean; error?: string; duration: number }> {
    const startTime = Date.now();

    const {
      profile,
      region,
      stacks = [],
      context = {},
    } = options;

    this.logger.debug(`Synthesizing CDK stacks in ${cdkPath}`);

    try {
      // Change to CDK directory
      const originalCwd = this.executor.getCwd();
      this.executor.setCwd(cdkPath);

      // Build the CDK synth command
      const args = ['synth'];

      // Add profile if specified
      if (profile) {
        args.push('--profile', profile);
      }

      // Add region if specified
      if (region) {
        args.push('--region', region);
      }

      // Add stacks if specified
      if (stacks.length > 0) {
        args.push(...stacks);
      }

      // Add context variables
      for (const [key, value] of Object.entries(context)) {
        args.push('--context', `${key}=${value}`);
      }

      // Execute CDK synth
      const result = await this.executor.execute('npx', ['cdk', ...args], {
        cwd: cdkPath,
        timeout: 300000, // 5 minutes
        streamOutput: false, // Synth output can be verbose
      });

      const duration = Date.now() - startTime;

      if (result.success) {
        this.logger.debug(`CDK synthesis completed successfully (${duration}ms)`);
        return { success: true, duration };
      } else {
        this.logger.error(`CDK synthesis failed: ${result.stderr}`);
        return { success: false, error: result.stderr, duration };
      }

    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.error('CDK synthesis failed', error);
      return { success: false, error: error.message, duration };
    }
  }

  /**
   * Bootstrap CDK environment if needed
   */
  async bootstrap(
    cdkPath: string,
    options: {
      profile?: string;
      region?: string;
      account?: string;
    } = {}
  ): Promise<{ success: boolean; error?: string; duration: number }> {
    const startTime = Date.now();

    const { profile, region, account } = options;

    this.logger.debug(`Bootstrapping CDK environment in ${cdkPath}`);

    try {
      // Change to CDK directory
      const originalCwd = this.executor.getCwd();
      this.executor.setCwd(cdkPath);

      // Build the CDK bootstrap command
      const args = ['bootstrap'];

      // Add profile if specified
      if (profile) {
        args.push('--profile', profile);
      }

      // Add account/region if specified
      if (account && region) {
        args.push(`${account}/${region}`);
      }

      // Execute CDK bootstrap
      const result = await this.executor.execute('npx', ['cdk', ...args], {
        cwd: cdkPath,
        timeout: 600000, // 10 minutes
        streamOutput: true,
      });

      const duration = Date.now() - startTime;

      if (result.success) {
        this.logger.debug(`CDK bootstrap completed successfully (${duration}ms)`);
        return { success: true, duration };
      } else {
        this.logger.error(`CDK bootstrap failed: ${result.stderr}`);
        return { success: false, error: result.stderr, duration };
      }

    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.error('CDK bootstrap failed', error);
      return { success: false, error: error.message, duration };
    }
  }
}
