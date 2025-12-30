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
   * Deploy NEAR core contracts for testnet/mainnet parity
   */
  private async deployCoreContracts(nearOutputs: LayerOutput): Promise<void> {
    this.context.logger.startOperation('Deploying NEAR core contracts');

    try {
      // Clone near/core-contracts repository (includes pre-built WASMs)
      const coreContractsPath = await this.ensureCoreContractsRepo();

      // Skip build - use pre-compiled WASMs from repository
      this.context.logger.info('Using pre-built WASMs from repository (production binaries)');

      // Deploy contracts to localnet
      await this.deployContractsToLocalnet(coreContractsPath, nearOutputs);

      this.context.logger.completeOperation('Core contracts deployment', 0);
    } catch (error: any) {
      this.context.logger.error('Failed to deploy core contracts', error);
      // Don't fail the entire layer deployment, just warn
      this.context.logger.warn('Continuing without core contracts - basic functionality still available');
    }
  }

  /**
   * Ensure near/core-contracts repository is cloned
   */
  private async ensureCoreContractsRepo(): Promise<string> {
    const repoUrl = 'https://github.com/near/core-contracts.git';
    const repoPath = await this.context.gitManager.ensureRepo(
      repoUrl,
      'master',
      'core-contracts'
    );

    this.context.logger.info(`Core contracts repository ready at: ${repoPath}`);
    return repoPath;
  }

  /**
   * Deploy contracts to localnet using node0 account
   */
  private async deployContractsToLocalnet(repoPath: string, nearOutputs: LayerOutput): Promise<void> {
    this.context.logger.info('Deploying contracts to localnet...');

    // Get master account key from SSM
    const keyResult = await this.context.commandExecutor.execute('aws', [
      'ssm', 'get-parameter',
      '--name', '/near-localnet/master-account-key',
      '--with-decryption',
      '--query', 'Parameter.Value',
      '--output', 'text',
      '--profile', this.context.globalConfig.aws_profile,
      '--region', this.context.globalConfig.aws_region,
    ], { silent: true });

    if (!keyResult.success) {
      throw new Error('Failed to retrieve master account key from SSM');
    }

    const masterAccountKey = keyResult.stdout.trim();

    // Get the services repo path (has near-api-js installed)
    const servicesRepoPath = await this.ensureRepository(
      this.context.layerConfig.source.repo_url,
      this.context.layerConfig.source.branch
    );

    // Create deployment script in the services repo (has dependencies)
    const deployScript = `
const nearAPI = require('near-api-js');
const fs = require('fs');
const path = require('path');

async function deploy() {
  const keyPair = nearAPI.utils.KeyPair.fromString('${masterAccountKey}');
  const keyStore = new nearAPI.keyStores.InMemoryKeyStore();
  await keyStore.setKey('localnet', 'node0', keyPair);

  const near = await nearAPI.connect({
    networkId: 'localnet',
    nodeUrl: '${nearOutputs.outputs.rpc_url}',
    keyStore,
  });

  const masterAccount = await near.account('node0');

  // Deploy priority contracts for testnet/mainnet parity (pre-built WASMs)
  const contracts = [
    { name: 'w-near', account: 'wrap.node0', wasm: 'w-near/res/w_near.wasm', initArgs: { owner_id: 'node0' } },
    { name: 'whitelist', account: 'whitelist.node0', wasm: 'whitelist/res/whitelist.wasm', initArgs: { foundation_account_id: 'node0' } },
    { name: 'staking-pool-factory', account: 'poolv1.node0', wasm: 'staking-pool-factory/res/staking_pool_factory.wasm', initArgs: { staking_pool_whitelist_account_id: 'whitelist.node0' } },
  ];

  for (const contract of contracts) {
    console.log(\`\\nDeploying \${contract.name} to \${contract.account}...\`);
    try {
      const wasmPath = path.join('${repoPath}', contract.wasm);
      const wasmBytes = fs.readFileSync(wasmPath);
      
      // Create account, deploy contract, and initialize in one transaction
      const publicKey = keyPair.getPublicKey();
      const actions = [
        nearAPI.transactions.createAccount(),
        nearAPI.transactions.transfer(nearAPI.utils.format.parseNearAmount('10')),
        nearAPI.transactions.deployContract(wasmBytes),
        nearAPI.transactions.functionCall(
          'new',
          Buffer.from(JSON.stringify(contract.initArgs)),
          '30000000000000',
          '0'
        ),
      ];
      
      const result = await masterAccount.signAndSendTransaction({
        receiverId: contract.account,
        actions,
      });
      
      console.log(\`✅ \${contract.name} deployed successfully (tx: \${result.transaction.hash})\`);
    } catch (error) {
      if (error.message && error.message.includes('already exists')) {
        console.log(\`⏭️  \${contract.account} already exists, skipping\`);
      } else {
        console.error(\`❌ Failed to deploy \${contract.name}:\`, error.message);
      }
    }
  }
  
  console.log('\\n✅ Core contracts deployment complete');
}

deploy().catch((e) => {
  console.error('Deployment failed:', e.message);
  process.exit(1);
});
`;

    // Write script to faucet directory (has near-api-js installed)
    const scriptPath = path.join(servicesRepoPath, 'faucet', 'deploy-contracts.js');
    const fs = require('fs');
    fs.writeFileSync(scriptPath, deployScript);
    this.context.logger.info(`Deployment script written to: ${scriptPath}`);

    // Execute deployment from faucet directory
    const result = await this.context.commandExecutor.execute(
      'node',
      [scriptPath],
      {
        cwd: path.join(servicesRepoPath, 'faucet'),
        streamOutput: true,
        timeout: 300000, // 5 minutes
      }
    );

    if (!result.success) {
      throw new Error(`Contract deployment failed: ${result.stderr}`);
    }

    this.context.logger.success('Core contracts deployed to localnet');
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

