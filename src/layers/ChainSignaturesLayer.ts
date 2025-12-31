/**
 * Chain Signatures Layer (Layer 3)
 * 
 * Manages cross-chain signing primitives including embedded MPC infrastructure.
 * This layer deploys the Chain Signatures API and MPC nodes together.
 * 
 * Note: MPC infrastructure is EMBEDDED in this layer, not a separate layer.
 * The MPC nodes are deployed as part of the cross-chain-simulator repository.
 */

import * as path from 'path';
import { BaseLayer } from './BaseLayer';
import { VerifyResult, DeployResult, LayerOutput } from '../types';

export class ChainSignaturesLayer extends BaseLayer {
  private readonly NEAR_GENESIS_PATH = '/home/ubuntu/.near/localnet/node0/genesis.json';

  /**
   * Verify if Chain Signatures infrastructure is already deployed
   */
  async verify(): Promise<VerifyResult> {
    const existingMpcNodes = this.context.layerConfig.config.existing_mpc_nodes as string[];

    if (existingMpcNodes && existingMpcNodes.length > 0) {
      this.context.logger.info(`Checking ${existingMpcNodes.length} existing MPC nodes`);

      // Get NEAR RPC URL from dependency layer
      const nearRpcUrl = this.getDependencyOutputs('near_base')?.outputs.rpc_url;
      const expectedContractId = this.context.layerConfig.config.mpc_contract_id;

      // Check health of all existing MPC nodes
      const healthChecks = await Promise.all(
        existingMpcNodes.map(async (nodeUrl, index) => {
          this.context.logger.debug(`Checking MPC node ${index + 1}/${existingMpcNodes.length}: ${nodeUrl}`);

          const healthResult = await this.context.healthChecker.checkMpcNode(
            nodeUrl,
            nearRpcUrl,
            expectedContractId,
            10000
          );

          return {
            url: nodeUrl,
            healthy: healthResult.healthy,
            responseTime: healthResult.response_time,
            error: healthResult.error,
          };
        })
      );

      const healthyNodes = healthChecks.filter(check => check.healthy);

      if (healthyNodes.length === existingMpcNodes.length) {
        this.context.logger.success(`All ${existingMpcNodes.length} MPC nodes are operational`);

        const outputs: Record<string, string> = {};
        existingMpcNodes.forEach((nodeUrl, index) => {
          outputs[`mpc_node_${index}_url`] = nodeUrl;
        });
        outputs.mpc_node_count = existingMpcNodes.length.toString();
        outputs.v1_signer_contract_id = expectedContractId || 'v1.signer.localnet';

        return {
          skip: true,
          reason: `All ${existingMpcNodes.length} MPC nodes are operational`,
          existingOutput: {
            layer_name: 'chain_signatures',
            deployed: false,
            outputs,
            timestamp: new Date().toISOString(),
          },
        };
      }
    }

    return { skip: false };
  }

  /**
   * Deploy Chain Signatures infrastructure (includes MPC nodes)
   */
  async deploy(): Promise<DeployResult> {
    const startTime = Date.now();

    try {
      this.context.logger.startOperation('Deploying Chain Signatures Layer (Layer 3)');

      // Get dependency outputs
      const nearOutputs = this.getDependencyOutputs('near_base');
      const servicesOutputs = this.getDependencyOutputs('near_services');
      const mpcConfig = this.context.layerConfig.config;

      if (!nearOutputs) {
        throw new Error('NEAR base layer outputs not available. Ensure near_base layer is deployed first.');
      }

      // Note: near_services is a dependency but we don't require specific outputs from it
      if (!servicesOutputs) {
        this.context.logger.warn('NEAR services layer outputs not available, but continuing...');
      }

      // Ensure cross-chain-simulator repository is cloned and ready
      const repoUrl = this.context.layerConfig.source.repo_url;
      const repoPath = await this.ensureRepository(repoUrl, this.context.layerConfig.source.branch);

      // Deploy MPC Infrastructure via CDK if cdk_path is provided
      if (this.context.layerConfig.source.cdk_path) {
        this.context.logger.info('Deploying MPC Infrastructure (CDK)...');
        const cdkPath = this.context.layerConfig.source.cdk_path;
        
        // Fetch authoritative NEAR boot node + genesis from inside the VPC (SSM on the NEAR base instance).
        // This prevents MPC nodes from accidentally using stale local config.local.json values.
        const nearBootstrap = await this.fetchNearBootstrapInfoViaSsm(nearOutputs);

        // Prepare context for MPC CDK
        // MPC stack needs to know where NEAR is? Usually via config or SSM.
        // It mostly creates EC2 instances.
        const mpcContext: Record<string, string> = {
          'accountId': this.context.globalConfig.aws_account,
          'region': this.context.globalConfig.aws_region,
          'vpcId': nearOutputs.outputs.vpc_id, // Put MPC in same VPC
          'nearRpcUrl': nearOutputs.outputs.rpc_url, // Pass RPC URL
          // IMPORTANT: mpc-repo CDK expects these exact context keys (see mpc-repo/infra/aws-cdk/bin/mpc-app.ts)
          'nearNetworkId': nearOutputs.outputs.network_id || 'localnet',
          'nearBootNodes': `${nearBootstrap.nodeKey}@${nearOutputs.outputs.private_ip}:24567`,
          'nearGenesis': nearBootstrap.genesisBase64,
          'mpcContractId': mpcConfig.mpc_contract_id || 'v1.signer.localnet',
          'nodeCount': (this.context.layerConfig.config.mpc_node_count || 3).toString(),
        };

        await this.deployCdkStacks(repoPath, cdkPath, {
          stacks: ['MpcStandaloneStack'], // Assuming this is the stack name
          context: mpcContext,
        });
        
        this.context.logger.success('MPC Infrastructure deployed');

        // Ensure MPC node Secrets Manager values are populated (not placeholders) before we run MPC setup.
        // The MPC nodes also wait for these to be populated on first boot.
        if (mpcConfig.auto_generate_keys !== false) {
          await this.ensureMpcNodeSecretsPopulated(repoPath, cdkPath);
        }
      }

      // Get script path for deployment
      const scriptPath = this.context.layerConfig.source.script_path;
      if (!scriptPath) {
        throw new Error('Script path not specified for Chain Signatures layer');
      }

      // Prepare environment variables for the deployment script
      const env = await this.prepareEnvironment(nearOutputs, servicesOutputs);

      // Execute the deployment script (deploys MPC nodes + v1.signer contract)
      this.context.logger.info('Deploying MPC infrastructure and Chain Signatures contract...');
      const scriptResult = await this.executeScript(repoPath, scriptPath, {
        env,
        cwd: repoPath,
      });

      if (!scriptResult.success) {
        throw new Error(`Chain Signatures deployment failed: ${scriptResult.error}`);
      }

      const duration = Date.now() - startTime;
      this.context.logger.completeOperation('Chain Signatures Layer deployment', duration);

      return {
        success: true,
        duration,
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.context.logger.failOperation('Chain Signatures Layer deployment', error);
      return {
        success: false,
        error: error.message,
        duration,
      };
    }
  }

  /**
   * The MPC CDK stack creates Secrets Manager secrets with placeholder values. If we don't replace them,
   * MPC setup will fail when trying to parse keys (and nodes will wait up to ~10 minutes on boot).
   */
  private async ensureMpcNodeSecretsPopulated(repoPath: string, cdkPath: string): Promise<void> {
    const PLACEHOLDER = 'PLACEHOLDER_REPLACE_WITH_REAL_KEY';
    const node0SecretId = 'mpc-node-0-mpc_account_sk';

    this.context.logger.info('Checking MPC node secrets (placeholders vs real keys)...');

    const secretResult = await this.context.commandExecutor.execute(
      'aws',
      [
        'secretsmanager',
        'get-secret-value',
        '--secret-id',
        node0SecretId,
        '--profile',
        this.context.globalConfig.aws_profile,
        '--region',
        this.context.globalConfig.aws_region,
        '--query',
        'SecretString',
        '--output',
        'text',
      ],
      { silent: true }
    );

    if (!secretResult.success) {
      this.context.logger.warn(
        `Could not read Secrets Manager value for '${node0SecretId}'. Assuming secrets are already configured.`
      );
      return;
    }

    const value = (secretResult.stdout || '').trim();
    if (!value || value === PLACEHOLDER) {
      this.context.logger.warn(
        `MPC node secrets are placeholders. Populating from mpc-repo test keys (localnet only).`
      );

      const workDir = path.join(repoPath, cdkPath);
      const updateScript = path.join(workDir, 'scripts', 'update-secrets.sh');

      const updateResult = await this.context.commandExecutor.execute(
        'bash',
        [updateScript, './mpc-node-keys.json', this.context.globalConfig.aws_profile],
        {
          cwd: workDir,
          env: {
            ...(process.env as Record<string, string>),
            AWS_PROFILE: this.context.globalConfig.aws_profile,
            AWS_REGION: this.context.globalConfig.aws_region,
          },
          streamOutput: true,
        }
      );

      if (!updateResult.success) {
        throw new Error(
          `Failed to populate MPC node secrets. Output:\n${updateResult.stderr || updateResult.stdout}`
        );
      }

      this.context.logger.success('✅ MPC node secrets populated');
    } else {
      this.context.logger.success('✅ MPC node secrets already populated');
    }
  }

  /**
   * Retrieve the NEAR base node_key (for boot nodes) and the genesis.json content (base64)
   * from the NEAR Base EC2 instance using SSM. This keeps MPC nodes aligned with the currently
   * deployed NEAR base chain (chain_id + genesis schema).
   */
  private async fetchNearBootstrapInfoViaSsm(
    nearOutputs: LayerOutput
  ): Promise<{ nodeKey: string; genesisBase64: string }> {
    const instanceId = nearOutputs.outputs.instance_id;
    if (!instanceId) {
      throw new Error('NEAR instance ID not available from Layer 1 outputs (required for MPC bootstrap info)');
    }

    // Use AWS-RunShellScript and keep output strictly machine-parseable.
    const parameters = {
      commands: [
        'set -eu',
        // Node key used for boot nodes (NEAR P2P public key)
        'NODE_KEY=$(curl -sS http://127.0.0.1:3030/status | jq -r .node_key)',
        // Genesis content is small (~6KB) and safe to emit as one line (no newlines).
        `GENESIS_B64=$(base64 -w 0 ${this.NEAR_GENESIS_PATH})`,
        'echo NODE_KEY=$NODE_KEY',
        'echo GENESIS_B64=$GENESIS_B64',
      ],
    };

    const sendResult = await this.context.commandExecutor.execute(
      'aws',
      [
        'ssm',
        'send-command',
        '--instance-ids',
        instanceId,
        '--document-name',
        'AWS-RunShellScript',
        '--parameters',
        JSON.stringify(parameters),
        '--query',
        'Command.CommandId',
        '--output',
        'text',
        '--profile',
        this.context.globalConfig.aws_profile,
        '--region',
        this.context.globalConfig.aws_region,
      ],
      { silent: true }
    );

    if (!sendResult.success || !sendResult.stdout) {
      throw new Error(`Failed to send SSM command to fetch NEAR bootstrap info: ${sendResult.stderr || sendResult.stdout}`);
    }

    const commandId = sendResult.stdout.trim();

    // Wait for completion (short, bounded).
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const statusResult = await this.context.commandExecutor.execute(
        'aws',
        [
          'ssm',
          'get-command-invocation',
          '--command-id',
          commandId,
          '--instance-id',
          instanceId,
          '--query',
          'Status',
          '--output',
          'text',
          '--profile',
          this.context.globalConfig.aws_profile,
          '--region',
          this.context.globalConfig.aws_region,
        ],
        { silent: true }
      );

      if (!statusResult.success) {
        continue;
      }

      const status = (statusResult.stdout || '').trim();
      if (status === 'Success') {
        break;
      }
      if (status === 'Failed' || status === 'Cancelled' || status === 'TimedOut') {
        const err = await this.context.commandExecutor.execute(
          'aws',
          [
            'ssm',
            'get-command-invocation',
            '--command-id',
            commandId,
            '--instance-id',
            instanceId,
            '--query',
            'StandardErrorContent',
            '--output',
            'text',
            '--profile',
            this.context.globalConfig.aws_profile,
            '--region',
            this.context.globalConfig.aws_region,
          ],
          { silent: true }
        );
        throw new Error(`SSM command ${status}: ${(err.stdout || err.stderr || '').trim()}`);
      }

      if (attempt === 29) {
        throw new Error('Timed out waiting for SSM command to fetch NEAR bootstrap info');
      }
    }

    const outputResult = await this.context.commandExecutor.execute(
      'aws',
      [
        'ssm',
        'get-command-invocation',
        '--command-id',
        commandId,
        '--instance-id',
        instanceId,
        '--query',
        'StandardOutputContent',
        '--output',
        'text',
        '--profile',
        this.context.globalConfig.aws_profile,
        '--region',
        this.context.globalConfig.aws_region,
      ],
      { silent: true }
    );

    if (!outputResult.success) {
      throw new Error(`Failed to read SSM output for NEAR bootstrap info: ${outputResult.stderr || outputResult.stdout}`);
    }

    const lines = (outputResult.stdout || '').split('\n').map(l => l.trim()).filter(Boolean);
    const nodeKeyLine = lines.find(l => l.startsWith('NODE_KEY='));
    const genesisLine = lines.find(l => l.startsWith('GENESIS_B64='));

    const nodeKey = nodeKeyLine?.split('=', 2)[1]?.trim();
    const genesisBase64 = genesisLine?.split('=', 2)[1]?.trim();

    if (!nodeKey || !nodeKey.startsWith('ed25519:')) {
      throw new Error(`Invalid NEAR node_key from SSM output: ${nodeKeyLine || '(missing)'}`);
    }
    if (!genesisBase64 || genesisBase64.length < 1000) {
      throw new Error(`Invalid genesis base64 from SSM output (too short): ${genesisBase64?.length ?? 0}`);
    }

    return { nodeKey, genesisBase64 };
  }

  /**
   * Prepare environment variables for the deployment script
   */
  private async prepareEnvironment(
    nearOutputs: LayerOutput,
    servicesOutputs?: LayerOutput
  ): Promise<Record<string, string>> {
    this.context.logger.info('Preparing environment for Chain Signatures deployment');

    const mpcConfig = this.context.layerConfig.config;

    const env: Record<string, string> = {
      // NEAR configuration
      // Allow local override (e.g., SSM port-forwarding to localhost) while keeping the
      // dependency output as the default source of truth.
      NEAR_RPC_URL: process.env.NEAR_RPC_URL || nearOutputs.outputs.rpc_url,
      NEAR_NETWORK_ID: nearOutputs.outputs.network_id,
      NEAR_VPC_ID: nearOutputs.outputs.vpc_id || '',

      // MPC configuration (embedded in this layer)
      MPC_NODE_COUNT: (mpcConfig.mpc_node_count || 3).toString(),
      MPC_CONTRACT_ID: mpcConfig.mpc_contract_id || 'v1.signer.localnet',
      MPC_DOCKER_IMAGE: mpcConfig.mpc_docker_image || 'nearone/mpc-node:3.1.0',
      AUTO_GENERATE_KEYS: mpcConfig.auto_generate_keys !== false ? 'true' : 'false',

      // Chain Signatures configuration
      DEPLOY_V1_SIGNER_CONTRACT: mpcConfig.deploy_v1_signer_contract !== false ? 'true' : 'false',
      INITIALIZE_MPC: mpcConfig.initialize_mpc !== false ? 'true' : 'false',

      // Master account configuration
      MASTER_ACCOUNT_ID: 'localnet',

      // AWS configuration
      AWS_PROFILE: this.context.globalConfig.aws_profile,
      AWS_REGION: this.context.globalConfig.aws_region,
      AWS_ACCOUNT_ID: this.context.globalConfig.aws_account,

      // Node.js environment
      NODE_ENV: 'production',
    };

    // Get master account key from SSM if not provided in config
    if (!env.MASTER_ACCOUNT_PRIVATE_KEY && !env.DEPLOYER_KMS_KEY_ID) {
      try {
        // Sanity check: verify localnet account ID matches expected value
        const accountIdResult = await this.context.commandExecutor.execute('aws', [
          'ssm', 'get-parameter',
          '--name', '/near-localnet/localnet-account-id',
          '--query', 'Parameter.Value',
          '--output', 'text',
          '--profile', this.context.globalConfig.aws_profile,
          '--region', this.context.globalConfig.aws_region,
        ], { silent: true });

        if (accountIdResult.success && accountIdResult.stdout) {
          const accountId = accountIdResult.stdout.trim();
          if (accountId !== 'localnet') {
            this.context.logger.warn(`SSM account ID mismatch: expected 'localnet', got '${accountId}'`);
          }
        }

        // We use aws cli via command executor to avoid adding sdk dependency just for this
        const result = await this.context.commandExecutor.execute('aws', [
          'ssm', 'get-parameter',
          '--name', '/near-localnet/localnet-account-key',
          '--with-decryption',
          '--query', 'Parameter.Value',
          '--output', 'text',
          '--profile', this.context.globalConfig.aws_profile,
          '--region', this.context.globalConfig.aws_region,
        ], { silent: true });

        if (result.success && result.stdout) {
          env.MASTER_ACCOUNT_PRIVATE_KEY = result.stdout.trim();
          this.context.logger.debug('Loaded localnet account key from SSM');
        }
      } catch (error) {
        this.context.logger.warn('Failed to load localnet account key from SSM');
      }
    }

    // Add faucet endpoint if available from services layer
    if (servicesOutputs?.outputs.faucet_endpoint) {
      env.FAUCET_ENDPOINT = servicesOutputs.outputs.faucet_endpoint;
    }

    this.context.logger.debug('Environment variables prepared:', Object.keys(env));

    return env;
  }

  /**
   * Get outputs from deployed Chain Signatures infrastructure
   */
  async getOutputs(): Promise<LayerOutput> {
    this.context.logger.info('Reading Chain Signatures Layer outputs');

    try {
      const repoUrl = this.context.layerConfig.source.repo_url;
      const repoName = this.extractRepoName(repoUrl);
      const repoPath = path.join(this.context.globalConfig.workspace_root, repoName);

      const outputs: Record<string, string> = {
        deployed: 'true',
        deploy_timestamp: new Date().toISOString(),
        v1_signer_contract_id: this.context.layerConfig.config.mpc_contract_id || 'v1.signer.localnet',
        mpc_node_count: (this.context.layerConfig.config.mpc_node_count || 3).toString(),
      };

      // Try to read deployment output files
      await this.extractOutputsFromFiles(repoPath, outputs);

      // Add NEAR RPC URL from dependency
      const nearOutputs = this.getDependencyOutputs('near_base');
      if (nearOutputs) {
        outputs.near_rpc_url = nearOutputs.outputs.rpc_url;
      }

      // Build chain_signatures_config JSON for intents layer
      outputs.chain_signatures_config = JSON.stringify({
        rpcUrl: outputs.near_rpc_url,
        mpcContractId: outputs.v1_signer_contract_id,
        mpcNodeCount: outputs.mpc_node_count,
      });

      this.context.logger.success('Chain Signatures deployed successfully');

      return this.createLayerOutput(outputs);

    } catch (error: any) {
      this.context.logger.error('Failed to read Chain Signatures Layer outputs', error);
      throw new Error(`Failed to get Chain Signatures outputs: ${error.message}`);
    }
  }

  /**
   * Extract outputs from files created by the deployment script
   */
  private async extractOutputsFromFiles(repoPath: string, outputs: Record<string, string>): Promise<void> {
    const fs = require('fs');

    const possibleOutputFiles = [
      'chain-signatures-config.json',
      'mpc-deployment-output.json',
      'deployment-output.json',
      '.env.deployed',
    ];

    for (const filename of possibleOutputFiles) {
      const filePath = path.join(repoPath, filename);

      if (fs.existsSync(filePath)) {
        try {
          this.context.logger.debug(`Reading output file: ${filename}`);

          if (filename.endsWith('.json')) {
            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content);
            this.flattenObject(data, outputs, `file_${filename.replace('.json', '')}`);
          } else if (filename.startsWith('.env')) {
            const content = fs.readFileSync(filePath, 'utf-8');
            const envVars = this.parseEnvFile(content);
            Object.assign(outputs, envVars);
          }
        } catch (error) {
          this.context.logger.warn(`Failed to read output file ${filename}`, error);
        }
      }
    }
  }

  /**
   * Parse environment file content
   */
  private parseEnvFile(content: string): Record<string, string> {
    const envVars: Record<string, string> = {};
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          envVars[key] = value;
        }
      }
    }
    return envVars;
  }

  /**
   * Flatten a nested object into dot-notation keys
   */
  private flattenObject(obj: any, result: Record<string, string>, prefix: string = ''): void {
    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}_${key}` : key;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        this.flattenObject(value, result, newKey);
      } else {
        result[newKey] = String(value);
      }
    }
  }

  /**
   * Destroy Chain Signatures infrastructure
   */
  async destroy(): Promise<{ success: boolean; error?: string }> {
    this.context.logger.startOperation('Destroying Chain Signatures Layer');

    try {
      const repoUrl = this.context.layerConfig.source.repo_url;
      const repoPath = await this.ensureRepository(repoUrl, this.context.layerConfig.source.branch);

      // Check for cleanup script
      const cleanupScript = this.context.layerConfig.config.cleanup_script;
      if (cleanupScript) {
        this.context.logger.info('Running cleanup script');
        const cleanupResult = await this.executeScript(repoPath, cleanupScript, {
          cwd: repoPath,
        });
        if (!cleanupResult.success) {
          this.context.logger.warn(`Cleanup script failed: ${cleanupResult.error}`);
        }
      }

      // Clean up generated files
      await this.cleanupGeneratedFiles(repoPath);

      this.context.logger.success('Chain Signatures Layer destroyed successfully');
      return { success: true };

    } catch (error: any) {
      this.context.logger.failOperation('Chain Signatures Layer destruction', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clean up generated files and artifacts
   */
  private async cleanupGeneratedFiles(repoPath: string): Promise<void> {
    const fs = require('fs');

    const filesToClean = [
      'chain-signatures-config.json',
      'mpc-deployment-output.json',
      'deployment-output.json',
      '.env.deployed',
    ];

    for (const file of filesToClean) {
      const filePath = path.join(repoPath, file);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          this.context.logger.debug(`Cleaned up: ${file}`);
        }
      } catch (error) {
        this.context.logger.warn(`Failed to clean up ${file}`, error);
      }
    }
  }
}

