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
    const stackExists = await this.checkStackExists('near-localnet-faucet-v2');
    if (stackExists) {
      this.context.logger.info('Faucet stack exists, reading outputs...');
      
      try {
        const outputs = await this.readStackOutputs('near-localnet-faucet-v2');
        
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

    // Create idempotent deployment script for SSM
    const deployScript = `#!/bin/bash
set -e
exec > >(tee /var/log/core-contracts-deploy.log) 2>&1

echo "=== Core Contracts Deployment Script ==="
echo "Timestamp: $(date)"

# Install near-cli-rs if missing (idempotent)
NEAR_CLI_VERSION="v0.23.2"
NEAR_CLI_BINARY="/usr/local/bin/near"

if [ ! -f "$NEAR_CLI_BINARY" ]; then
  echo "Installing near-cli-rs $NEAR_CLI_VERSION..."
  cd /tmp
  curl -L -o near-cli-rs.tar.gz "https://github.com/near/near-cli-rs/releases/download/$NEAR_CLI_VERSION/near-cli-rs-x86_64-unknown-linux-gnu.tar.gz"
  tar -xzf near-cli-rs.tar.gz
  sudo mv near /usr/local/bin/near
  sudo chmod +x /usr/local/bin/near
  rm -f near-cli-rs.tar.gz
  echo "✅ near-cli-rs installed"
else
  echo "✅ near-cli-rs already installed"
fi

# Verify near-cli-rs works
near --version || { echo "ERROR: near-cli-rs not working"; exit 1; }

# Get localnet account key from SSM (on instance)
echo "Fetching localnet account key from SSM..."
TOKEN=$(curl -sS -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" || true)
if [ -n "$TOKEN" ]; then
  AWS_REGION=$(curl -sS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/region)
else
  AWS_REGION=$(curl -sS http://169.254.169.254/latest/meta-data/placement/region)
fi

LOCALNET_KEY=$(aws ssm get-parameter --name "/near-localnet/localnet-account-key" --with-decryption --query "Parameter.Value" --output text --region "$AWS_REGION" 2>/dev/null || echo "")
if [ -z "$LOCALNET_KEY" ]; then
  echo "ERROR: Failed to retrieve localnet account key from SSM"
  exit 1
fi

# Clone core-contracts repository (idempotent)
CONTRACTS_DIR="/tmp/core-contracts"
if [ ! -d "$CONTRACTS_DIR" ]; then
  echo "Cloning core-contracts repository..."
  git clone --depth 1 https://github.com/near/core-contracts.git "$CONTRACTS_DIR"
else
  echo "✅ core-contracts repository already exists, updating..."
  cd "$CONTRACTS_DIR"
  git pull || true
fi

# Configure near-cli-rs for localnet
echo "Configuring near-cli-rs for localnet..."
near config add-connection --network-name localnet --connection-name localnet-deploy \\
  --rpc-url http://127.0.0.1:3030/ \\
  --wallet-url http://127.0.0.1:3030/ \\
  --explorer-transaction-url http://127.0.0.1:3030/ || true

# Import localnet account key
echo "Importing localnet account key..."
echo "$LOCALNET_KEY" | near account import-account using-private-key network-config localnet-deploy sign-as localnet || {
  echo "Account key may already be imported, continuing..."
}

# Deploy contracts using near-cli-rs
# Note: We'll use near-cli-rs account creation and near contract deploy commands
CONTRACTS=(
  "wrap.localnet:w-near/res/w_near.wasm:{\\\"owner_id\\\":\\\"localnet\\\"}"
  "whitelist.localnet:whitelist/res/whitelist.wasm:{\\\"foundation_account_id\\\":\\\"localnet\\\"}"
  "poolv1.localnet:staking-pool-factory/res/staking_pool_factory.wasm:{\\\"staking_pool_whitelist_account_id\\\":\\\"whitelist.localnet\\\"}"
)

for contract_spec in "\${CONTRACTS[@]}"; do
  IFS=':' read -r account_id wasm_path init_args <<< "$contract_spec"
  echo ""
  echo "=== Deploying $account_id ==="
  
  # Check if account already exists via RPC
  ACCOUNT_CHECK=$(curl -sS http://127.0.0.1:3030 -H "Content-Type: application/json" -d "{\\\"jsonrpc\\\":\\\"2.0\\\",\\\"id\\\":\\\"1\\\",\\\"method\\\":\\\"query\\\",\\\"params\\\":{\\\"request_type\\\":\\\"view_account\\\",\\\"finality\\\":\\\"final\\\",\\\"account_id\\\":\\\"$account_id\\\"}}")
  
  if echo "$ACCOUNT_CHECK" | grep -q "UNKNOWN_ACCOUNT"; then
    echo "Account $account_id does not exist, creating..."
    
    # Create account with near-cli-rs
    near account create-account fund-myself "$account_id" "10 NEAR" autogenerate-new-keypair save-to-legacy-keychain sign-as localnet network-config localnet-deploy sign-with-legacy-keychain send || {
      echo "ERROR: Failed to create account $account_id"
      exit 1
    }
    
    echo "Account $account_id created, deploying contract..."
    
    # Deploy contract WASM
    near contract deploy build-non-reproducible-wasm "$account_id" use-file "$CONTRACTS_DIR/$wasm_path" without-init-call network-config localnet-deploy sign-with-legacy-keychain send || {
      echo "ERROR: Failed to deploy contract to $account_id"
      exit 1
    }
    
    echo "Contract deployed, initializing..."
    
    # Initialize contract
    near contract call-function as-transaction "$account_id" new json-args "$init_args" prepaid-gas '300 Tgas' attached-deposit '0 NEAR' sign-as localnet network-config localnet-deploy sign-with-legacy-keychain send || {
      echo "ERROR: Failed to initialize contract $account_id"
      exit 1
    }
    
    echo "✅ $account_id deployed and initialized"
  else
    echo "⏭️  $account_id already exists, skipping"
  fi
done

# Verify all contracts exist
echo ""
echo "=== Verifying deployed contracts ==="
for contract_spec in "\${CONTRACTS[@]}"; do
  IFS=':' read -r account_id wasm_path init_args <<< "$contract_spec"
  if curl -sS http://127.0.0.1:3030 -H "Content-Type: application/json" -d "{\\\"jsonrpc\\\":\\\"2.0\\\",\\\"id\\\":\\\"1\\\",\\\"method\\\":\\\"query\\\",\\\"params\\\":{\\\"request_type\\\":\\\"view_account\\\",\\\"finality\\\":\\\"final\\\",\\\"account_id\\\":\\\"$account_id\\\"}}" | grep -q "UNKNOWN_ACCOUNT"; then
    echo "❌ ERROR: $account_id does not exist after deployment"
    exit 1
  else
    echo "✅ $account_id verified"
  fi
done

echo ""
echo "=== Core Contracts Deployment Complete ==="
`;

    // Write script to a file first, then execute it (SSM parameters need proper JSON escaping)
    // We'll use a two-step approach: write script, then execute
    const scriptPath = '/tmp/deploy-core-contracts.sh';
    
    // Step 1: Write the script to file
    const writeScriptCmd = `cat > ${scriptPath} << 'SCRIPTEOF'\n${deployScript}\nSCRIPTEOF\nchmod +x ${scriptPath}`;
    
    this.context.logger.info(`Writing deployment script to instance ${instanceId}...`);
    const writeResult = await this.context.commandExecutor.execute('aws', [
      'ssm', 'send-command',
      '--instance-ids', instanceId,
      '--document-name', 'AWS-RunShellScript',
      '--parameters', `commands=["${writeScriptCmd.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"]`,
      '--timeout-seconds', '60',
      '--profile', this.context.globalConfig.aws_profile,
      '--region', this.context.globalConfig.aws_region,
      '--output', 'json',
    ], { silent: true });

    if (!writeResult.success) {
      throw new Error(`Failed to write deployment script: ${writeResult.stderr}`);
    }

    // Parse write command ID
    let writeCommandId: string;
    try {
      const writeOutput = JSON.parse(writeResult.stdout);
      writeCommandId = writeOutput.Command.CommandId;
    } catch {
      throw new Error('Failed to parse SSM command ID from write script output');
    }

    // Wait for write to complete
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Step 2: Execute the script
    this.context.logger.info(`Executing deployment script on instance ${instanceId}...`);
    const commandResult = await this.context.commandExecutor.execute('aws', [
      'ssm', 'send-command',
      '--instance-ids', instanceId,
      '--document-name', 'AWS-RunShellScript',
      '--parameters', `commands=["bash ${scriptPath}"]`,
      '--timeout-seconds', '600', // 10 minutes
      '--profile', this.context.globalConfig.aws_profile,
      '--region', this.context.globalConfig.aws_region,
      '--output', 'json',
    ], { silent: false });

    if (!commandResult.success) {
      throw new Error(`SSM command failed: ${commandResult.stderr}`);
    }

    // Parse command ID from JSON output
    let commandId: string;
    try {
      const commandOutput = JSON.parse(commandResult.stdout);
      commandId = commandOutput.Command.CommandId;
    } catch {
      throw new Error('Failed to parse SSM command ID from JSON output');
    }

    this.context.logger.info(`SSM command sent, waiting for completion (command ID: ${commandId})...`);

    // Wait for command completion and check status
    let attempts = 0;
    const maxAttempts = 60; // 10 minutes max (10 second intervals)
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
   * Get outputs from deployed NEAR Services
   */
  async getOutputs(): Promise<LayerOutput> {
    this.context.logger.info('Reading NEAR Services Layer outputs');

    try {
      // Try to read faucet stack outputs
      let faucetOutputs: Record<string, string> = {};
      try {
        faucetOutputs = await this.readStackOutputs('near-localnet-faucet-v2');
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
          stacks: ['near-localnet-faucet-v2'],
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

