/**
 * NEAR Services Layer (Layer 2)
 * 
 * Manages essential utility services for NEAR localnet development.
 * Includes:
 * - Faucet service for token distribution
 * - (Future) Gas payer contracts
 * - (Future) Account management utilities
 * - (Future) Health monitoring
 */

import * as path from 'path';
import { BaseLayer } from './BaseLayer';
import { VerifyResult, DeployResult, LayerOutput } from '../types';

export class NearServicesLayer extends BaseLayer {
  /**
   * Verify if NEAR Services are already deployed
   */
  async verify(): Promise<VerifyResult> {
    const existingFaucetEndpoint = this.context.layerConfig.config.existing_faucet_endpoint;

    if (existingFaucetEndpoint) {
      this.context.logger.info(`Checking existing faucet at: ${existingFaucetEndpoint}`);

      // Check if faucet endpoint is accessible
      const healthResult = await this.runHealthCheck(existingFaucetEndpoint, 'http');

      if (healthResult) {
        this.context.logger.success(`Existing faucet is operational: ${existingFaucetEndpoint}`);

        return {
          skip: true,
          reason: 'Existing faucet endpoint is operational',
          existingOutput: {
            layer_name: 'near_services',
            deployed: false,
            outputs: {
              faucet_endpoint: existingFaucetEndpoint,
              deployed: 'false',
            },
            timestamp: new Date().toISOString(),
          },
        };
      }
    }

    // Check if faucet stack already exists in AWS
    const stackExists = await this.checkStackExists('near-localnet-faucet');
    if (stackExists) {
      this.context.logger.info('Faucet stack exists, reading outputs...');
      
      try {
        const outputs = await this.readStackOutputs('near-localnet-faucet');
        
        if (outputs.FaucetEndpoint) {
          return {
            skip: true,
            reason: 'Faucet infrastructure already deployed',
            existingOutput: {
              layer_name: 'near_services',
              deployed: true,
              outputs: {
                faucet_endpoint: outputs.FaucetEndpoint,
                faucet_lambda_arn: outputs.FaucetLambdaArn || '',
                deployed: 'true',
              },
              timestamp: new Date().toISOString(),
            },
          };
        }
      } catch (error) {
        this.context.logger.warn('Could not read faucet stack outputs, will deploy');
      }
    }

    return { skip: false };
  }

  /**
   * Deploy NEAR Services infrastructure
   */
  async deploy(): Promise<DeployResult> {
    const startTime = Date.now();

    try {
      this.context.logger.startOperation('Deploying NEAR Services Layer (Layer 2)');

      // Get NEAR base layer outputs (required dependency)
      const nearOutputs = this.getDependencyOutputs('near_base');
      if (!nearOutputs) {
        throw new Error('NEAR base layer outputs not available. Ensure near_base layer is deployed first.');
      }

      // Ensure near-localnet-services repository is cloned and ready
      const repoUrl = this.context.layerConfig.source.repo_url;
      const repoPath = await this.ensureRepository(repoUrl, this.context.layerConfig.source.branch);

      // Get CDK path
      const cdkPath = this.context.layerConfig.source.cdk_path;
      if (!cdkPath) {
        throw new Error('CDK path not specified for NEAR Services layer');
      }

      // Generate configuration for faucet deployment
      await this.generateFaucetConfig(repoPath, nearOutputs);

      // Prepare context for Faucet deployment
      // We map orchestrator config to the context keys expected by bin/faucet-stack.ts
      const faucetContext: Record<string, string> = {
        'nearNodeUrl': nearOutputs.outputs.rpc_url, // Was 'near:rpc:url'
        'nearNetworkId': nearOutputs.outputs.network_id,
        'ssmMasterAccountIdParam': this.context.layerConfig.config.master_account_id_param || '/near-localnet/master-account-id',
        'vpcId': nearOutputs.outputs.vpc_id,
        'accountId': this.context.globalConfig.aws_account,
        'region': this.context.globalConfig.aws_region,
      };

      // Only pass security group if it exists
      if (nearOutputs.outputs.security_group_id) {
        faucetContext['securityGroupId'] = nearOutputs.outputs.security_group_id;
      }

      // Deploy faucet CDK stack (use construct ID NearFaucetStack, not stack name)
      this.context.logger.info('Deploying faucet infrastructure...');
      const deployResult = await this.deployCdkStacks(repoPath, cdkPath, {
        stacks: ['NearFaucetStack'],
        context: faucetContext,
      });

      const duration = Date.now() - startTime;
      this.context.logger.completeOperation('NEAR Services Layer deployment', duration);

      return deployResult;

    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.context.logger.failOperation('NEAR Services Layer deployment', error);
      return {
        success: false,
        error: error.message,
        duration,
      };
    }
  }

  /**
   * Generate configuration for faucet deployment
   */
  private async generateFaucetConfig(repoPath: string, nearOutputs: LayerOutput): Promise<void> {
    const cdkPath = this.context.layerConfig.source.cdk_path;
    if (!cdkPath) {
      throw new Error('CDK path not specified for NEAR Services layer');
    }
    const configPath = path.join(repoPath, cdkPath, 'config.local.json');

    this.context.logger.info('Generating faucet configuration');

    const config = {
      aws: {
        profile: this.context.globalConfig.aws_profile,
        region: this.context.globalConfig.aws_region,
        account: this.context.globalConfig.aws_account,
      },
      near: {
        rpcUrl: nearOutputs.outputs.rpc_url,
        networkId: nearOutputs.outputs.network_id,
        vpcId: nearOutputs.outputs.vpc_id,
        masterAccountId: this.context.layerConfig.config.master_account_id || 'node0',
      },
      faucet: {
        defaultAmount: this.context.layerConfig.config.default_amount || '10',
        maxAmount: this.context.layerConfig.config.max_amount || '100',
      },
    };

    await this.writeConfigFile(configPath, config);
    this.context.logger.success(`Faucet configuration written to: ${configPath}`);
  }

  /**
   * Check if a CloudFormation stack exists
   */
  private async checkStackExists(stackName: string): Promise<boolean> {
    try {
      const result = await this.context.commandExecutor.execute('aws', [
        'cloudformation', 'list-stacks',
        '--profile', this.context.globalConfig.aws_profile,
        '--region', this.context.globalConfig.aws_region,
        '--query', `StackSummaries[?StackName=='${stackName}' && StackStatus!='DELETE_COMPLETE']`,
        '--output', 'text'
      ], { silent: true });

      return result.success && result.stdout.trim().length > 0;
    } catch (error) {
      this.context.logger.debug(`Error checking stack existence: ${error}`);
      return false;
    }
  }

  /**
   * Get outputs from deployed NEAR Services
   */
  async getOutputs(): Promise<LayerOutput> {
    this.context.logger.info('Reading NEAR Services Layer outputs');

    try {
      // Try to read faucet stack outputs
      let faucetOutputs: Record<string, string> = {};
      try {
        faucetOutputs = await this.readStackOutputs('near-localnet-faucet');
      } catch (error) {
        this.context.logger.warn('Could not read faucet stack outputs');
      }

      const outputs: Record<string, string> = {
        deployed: 'true',
        deploy_timestamp: new Date().toISOString(),
        faucet_endpoint: faucetOutputs.FaucetEndpoint || '',
        faucet_lambda_arn: faucetOutputs.FaucetLambdaArn || '',
      };

      // Add NEAR RPC URL from dependency
      const nearOutputs = this.getDependencyOutputs('near_base');
      if (nearOutputs) {
        outputs.near_rpc_url = nearOutputs.outputs.rpc_url;
      }

      if (outputs.faucet_endpoint) {
        this.context.logger.success(`Faucet available at: ${outputs.faucet_endpoint}`);
      }

      return this.createLayerOutput(outputs);

    } catch (error: any) {
      this.context.logger.error('Failed to read NEAR Services Layer outputs', error);
      throw new Error(`Failed to get NEAR Services outputs: ${error.message}`);
    }
  }

  /**
   * Destroy NEAR Services infrastructure
   */
  async destroy(): Promise<{ success: boolean; error?: string }> {
    this.context.logger.startOperation('Destroying NEAR Services Layer');

    try {
      const repoUrl = this.context.layerConfig.source.repo_url;
      const repoPath = await this.ensureRepository(repoUrl, this.context.layerConfig.source.branch);

      const cdkPath = this.context.layerConfig.source.cdk_path;
      if (!cdkPath) {
        throw new Error('CDK path not specified for NEAR Services layer');
      }

      // Destroy faucet stack
      const destroyResult = await this.context.cdkManager.destroy(
        path.join(repoPath, cdkPath),
        {
          profile: this.context.globalConfig.aws_profile,
          region: this.context.globalConfig.aws_region,
          stacks: ['near-localnet-faucet'],
          force: true,
        }
      );

      if (destroyResult.success) {
        this.context.logger.success('NEAR Services Layer destroyed successfully');
        return { success: true };
      } else {
        this.context.logger.error('NEAR Services Layer destruction failed', destroyResult.error);
        return { success: false, error: destroyResult.error };
      }

    } catch (error: any) {
      this.context.logger.failOperation('NEAR Services Layer destruction', error);
      return { success: false, error: error.message };
    }
  }
}

