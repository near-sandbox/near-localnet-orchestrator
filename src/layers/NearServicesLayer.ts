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

import * as fs from 'fs';
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
    // Prefer v3 (v2 can be stuck in DELETE_IN_PROGRESS due to Lambda VPC ENI cleanup)
    const stackNamesToCheck = ['near-localnet-faucet-v3', 'near-localnet-faucet-v2'];
    for (const stackName of stackNamesToCheck) {
      const stackExists = await this.checkStackExists(stackName);
      if (!stackExists) {
        continue;
      }

      this.context.logger.info(`Faucet stack exists (${stackName}), reading outputs...`);

      try {
        const outputs = await this.readStackOutputs(stackName);

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
        this.context.logger.warn(`Could not read faucet stack outputs for ${stackName}, will deploy`);
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
        'ssmLocalnetAccountIdParam': '/near-localnet/localnet-account-id',
        'ssmLocalnetAccountKeyParam': '/near-localnet/localnet-account-key',
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

      // Deploy core contracts for testnet/mainnet parity
      await this.deployCoreContracts(nearOutputs);

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
          masterAccountId: 'localnet',
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
   * Deploy NEAR core contracts for testnet/mainnet parity
   */
  private async deployCoreContracts(nearOutputs: LayerOutput): Promise<void> {
    this.context.logger.startOperation('Deploying NEAR core contracts');

    try {
      // Deploy contracts via SSM on the NEAR EC2 instance (inside VPC)
      await this.deployContractsViaSSM(nearOutputs);

      this.context.logger.completeOperation('Core contracts deployment', 0);
    } catch (error: any) {
      this.context.logger.error('Failed to deploy core contracts', error);
      // Fail Layer 2 deployment if core contracts fail (per plan requirement)
      throw new Error(`Core contracts deployment failed: ${error.message}`);
    }
  }

  /**
   * Deploy contracts via SSM Run Command on NEAR EC2 instance (inside VPC)
   */
  private async deployContractsViaSSM(nearOutputs: LayerOutput): Promise<void> {
    this.context.logger.info('Deploying core contracts via SSM on NEAR EC2 instance...');

    const instanceId = nearOutputs.outputs.instance_id;
    if (!instanceId) {
      throw new Error('NEAR instance ID not available from Layer 1 outputs');
    }

    // Use a dedicated SSM Command document (much more reliable than embedding a multi-line script
    // inside send-command parameters, which is sensitive to newline escaping and /bin/sh vs bash).
    const documentName = await this.ensureCoreContractsSsmDocument();

    const parameters = {
      AwsRegion: [this.context.globalConfig.aws_region],
      RpcUrl: ['http://127.0.0.1:3030'],
      NetworkConnectionName: ['localnet-deploy'],
      LocalnetAccountId: ['localnet'],
      LocalnetKeySsmParam: ['/near-localnet/localnet-account-key'],
      CoreContractsRepoUrl: ['https://github.com/near/core-contracts.git'],
      CoreContractsGitRef: ['master'],
      NearCliTarballUrl: [
        'https://github.com/near/near-cli-rs/releases/latest/download/near-cli-rs-x86_64-unknown-linux-gnu.tar.gz',
      ],
      ContractFundingAmount: ['10NEAR'],
      InitGas: ['300TeraGas'],
    };

    this.context.logger.info(
      `Executing SSM document '${documentName}' on instance ${instanceId}...`
    );

    const commandResult = await this.context.commandExecutor.execute('aws', [
      'ssm', 'send-command',
      '--instance-ids', instanceId,
      '--document-name', documentName,
      '--parameters', JSON.stringify(parameters),
      '--timeout-seconds', '1800', // 30 minutes
      '--profile', this.context.globalConfig.aws_profile,
      '--region', this.context.globalConfig.aws_region,
      '--output', 'json',
    ], { silent: true, streamOutput: false });

    if (!commandResult.success) {
      throw new Error(`SSM command failed: ${commandResult.stderr}`);
    }

    // Parse command ID from JSON output (stdout can be empty when output is streamed)
    let commandId: string;
    try {
      const commandOutputText = (commandResult.stdout || '').trim() || (commandResult.stderr || '').trim();
      if (!commandOutputText) {
        throw new Error('Empty output');
      }
      const commandOutput = JSON.parse(commandOutputText);
      commandId = commandOutput.Command.CommandId;
    } catch (error: any) {
      throw new Error(
        `Failed to parse SSM command ID from JSON output: ${error?.message || String(error)}`
      );
    }

    this.context.logger.info(`SSM command sent, waiting for completion (command ID: ${commandId})...`);

    // Wait for command completion and check status
    let attempts = 0;
    const maxAttempts = 180; // 30 minutes max (10 second intervals)
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

      const statusResult = await this.context.commandExecutor.execute('aws', [
        'ssm', 'get-command-invocation',
        '--command-id', commandId,
        '--instance-id', instanceId,
        '--query', 'Status',
        '--output', 'text',
        '--profile', this.context.globalConfig.aws_profile,
        '--region', this.context.globalConfig.aws_region,
      ], { silent: true });

      if (statusResult.success) {
        const status = statusResult.stdout.trim();
        if (status === 'Success') {
          this.context.logger.success('Core contracts deployed successfully via SSM');
          
          // Get output to verify
          const outputResult = await this.context.commandExecutor.execute('aws', [
            'ssm', 'get-command-invocation',
            '--command-id', commandId,
            '--instance-id', instanceId,
            '--query', 'StandardOutputContent',
            '--output', 'text',
            '--profile', this.context.globalConfig.aws_profile,
            '--region', this.context.globalConfig.aws_region,
          ], { silent: false });

          if (outputResult.success) {
            this.context.logger.info('Deployment output:');
            this.context.logger.info(outputResult.stdout);
          }
          return;
        } else if (status === 'Failed' || status === 'Cancelled' || status === 'TimedOut') {
          // Get error output
          const errorResult = await this.context.commandExecutor.execute('aws', [
            'ssm', 'get-command-invocation',
            '--command-id', commandId,
            '--instance-id', instanceId,
            '--query', 'StandardErrorContent',
            '--output', 'text',
            '--profile', this.context.globalConfig.aws_profile,
            '--region', this.context.globalConfig.aws_region,
          ], { silent: false });

          throw new Error(`SSM command ${status}: ${errorResult.stdout || 'No error details'}`);
        }
        // Status is InProgress or Pending, continue waiting
      }

      attempts++;
    }

    throw new Error('SSM command timed out waiting for completion');
  }

  /**
   * Ensure the core-contract deployment SSM document exists and is set to the latest default version.
   */
  private async ensureCoreContractsSsmDocument(): Promise<string> {
    const documentName = 'near-localnet-deploy-core-contracts';
    // Do NOT rely on process.cwd() here because some parts of the orchestrator
    // (CDK deploy helpers) change the process CWD.
    // Resolve relative to the orchestrator package root: <repo>/src/layers -> <repo>
    const orchestratorRoot = path.resolve(__dirname, '..', '..');
    const documentPath = path.join(
      orchestratorRoot,
      'assets',
      'ssm-documents',
      'near-localnet-deploy-core-contracts.yaml'
    );

    if (!fs.existsSync(documentPath)) {
      throw new Error(`SSM document file not found at: ${documentPath}`);
    }

    // Check whether the document exists
    const describeResult = await this.context.commandExecutor.execute('aws', [
      'ssm',
      'describe-document',
      '--name',
      documentName,
      '--profile',
      this.context.globalConfig.aws_profile,
      '--region',
      this.context.globalConfig.aws_region,
      '--query',
      'Document.Name',
      '--output',
      'text',
    ], { silent: true });

    const exists = describeResult.success && describeResult.stdout.trim() === documentName;

    if (!exists) {
      this.context.logger.info(`Creating SSM document '${documentName}'...`);
      const createResult = await this.context.commandExecutor.execute('aws', [
        'ssm',
        'create-document',
        '--name',
        documentName,
        '--document-type',
        'Command',
        '--document-format',
        'YAML',
        '--content',
        `file://${documentPath}`,
        '--profile',
        this.context.globalConfig.aws_profile,
        '--region',
        this.context.globalConfig.aws_region,
        '--output',
        'json',
      ], { silent: true });

      if (!createResult.success) {
        throw new Error(`Failed to create SSM document: ${createResult.stderr || createResult.stdout}`);
      }
    } else {
      this.context.logger.info(`Updating SSM document '${documentName}'...`);
      const updateResult = await this.context.commandExecutor.execute('aws', [
        'ssm',
        'update-document',
        '--name',
        documentName,
        '--document-version',
        '$LATEST',
        '--document-format',
        'YAML',
        '--content',
        `file://${documentPath}`,
        '--profile',
        this.context.globalConfig.aws_profile,
        '--region',
        this.context.globalConfig.aws_region,
        '--output',
        'json',
      ], { silent: true });

      if (!updateResult.success) {
        const combined = `${updateResult.stderr || ''}\n${updateResult.stdout || ''}`;
        // AWS returns DuplicateDocumentContent when the content is identical to the current version.
        // This should be treated as an idempotent no-op.
        if (combined.includes('DuplicateDocumentContent')) {
          this.context.logger.info(`SSM document '${documentName}' unchanged (DuplicateDocumentContent). Skipping update.`);
        } else {
          throw new Error(`Failed to update SSM document: ${updateResult.stderr || updateResult.stdout}`);
        }
      }
    }

    // Point default version to the latest version
    const latestVersionResult = await this.context.commandExecutor.execute('aws', [
      'ssm',
      'describe-document',
      '--name',
      documentName,
      '--profile',
      this.context.globalConfig.aws_profile,
      '--region',
      this.context.globalConfig.aws_region,
      '--query',
      'Document.LatestVersion',
      '--output',
      'text',
    ], { silent: true });

    if (!latestVersionResult.success) {
      throw new Error(`Failed to read SSM document latest version: ${latestVersionResult.stderr}`);
    }

    const latestVersion = latestVersionResult.stdout.trim();
    if (!latestVersion) {
      throw new Error('SSM document latest version is empty');
    }

    const setDefaultResult = await this.context.commandExecutor.execute('aws', [
      'ssm',
      'update-document-default-version',
      '--name',
      documentName,
      '--document-version',
      latestVersion,
      '--profile',
      this.context.globalConfig.aws_profile,
      '--region',
      this.context.globalConfig.aws_region,
      '--output',
      'json',
    ], { silent: true });

    if (!setDefaultResult.success) {
      throw new Error(`Failed to set default SSM document version: ${setDefaultResult.stderr}`);
    }

    return documentName;
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
        faucetOutputs = await this.readStackOutputs('near-localnet-faucet-v3');
      } catch (error) {
        // Back-compat: older deployments may still be on v2
        try {
          faucetOutputs = await this.readStackOutputs('near-localnet-faucet-v2');
        } catch {
          this.context.logger.warn('Could not read faucet stack outputs');
        }
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
          // IMPORTANT: CDK CLI expects stack IDs (construct IDs), not CloudFormation stackName values.
          // Stack ID is defined in near-localnet-services/faucet/cdk/bin/faucet-stack.ts.
          stacks: ['NearFaucetStack'],
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

