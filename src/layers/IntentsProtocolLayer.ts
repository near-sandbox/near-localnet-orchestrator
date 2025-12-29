/**
 * Intents Protocol Layer (Layer 4)
 * 
 * Manages the NEAR Intents Protocol (1Click API) simulator.
 * This layer provides cross-chain swap orchestration on top of Chain Signatures.
 * 
 * Features:
 * - Quote generation for cross-chain swaps
 * - Route optimization (Rainbow Bridge, Uniswap, etc.)
 * - Execution coordination
 * - Asset registry
 */

import * as path from 'path';
import { BaseLayer } from './BaseLayer';
import { VerifyResult, DeployResult, LayerOutput } from '../types';

export class IntentsProtocolLayer extends BaseLayer {
  /**
   * Verify if Intents Protocol is already configured
   */
  async verify(): Promise<VerifyResult> {
    // The Intents layer is primarily a library, not infrastructure
    // Check if the simulator is already configured and ready

    const chainSignaturesOutputs = this.getDependencyOutputs('chain_signatures');

    if (!chainSignaturesOutputs) {
      this.context.logger.warn('Chain Signatures layer outputs not available');
      return { skip: false };
    }

    // Check if intents simulator config exists
    const repoUrl = this.context.layerConfig.source.repo_url;
    const repoName = this.extractRepoName(repoUrl);
    const repoPath = path.join(this.context.globalConfig.workspace_root, repoName);
    const configPath = path.join(repoPath, 'intents-config.json');

    const fs = require('fs');
    if (fs.existsSync(configPath)) {
      try {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent);

        // Check if config matches current chain signatures
        if (config.chainSignaturesConfig) {
          this.context.logger.success('Intents Protocol already configured');
          
          return {
            skip: true,
            reason: 'Intents Protocol simulator already configured',
            existingOutput: {
              layer_name: 'intents_protocol',
              deployed: true,
              outputs: {
                mode: config.mode || 'simulator',
                configured: 'true',
                supported_chains: (config.supportedChains || []).join(','),
              },
              timestamp: new Date().toISOString(),
            },
          };
        }
      } catch (error) {
        this.context.logger.debug('Could not read intents config');
      }
    }

    return { skip: false };
  }

  /**
   * Deploy/Configure Intents Protocol
   */
  async deploy(): Promise<DeployResult> {
    const startTime = Date.now();

    try {
      this.context.logger.startOperation('Configuring Intents Protocol Layer (Layer 4)');

      // Get Chain Signatures layer outputs (required dependency)
      const chainSignaturesOutputs = this.getDependencyOutputs('chain_signatures');
      if (!chainSignaturesOutputs) {
        throw new Error('Chain Signatures layer outputs not available. Ensure chain_signatures layer is deployed first.');
      }

      // Ensure near-intents-simulator repository is cloned and ready
      const repoUrl = this.context.layerConfig.source.repo_url;
      const repoPath = await this.ensureRepository(repoUrl, this.context.layerConfig.source.branch);

      // Install dependencies
      this.context.logger.info('Installing dependencies...');
      await this.context.commandExecutor.execute('npm', ['install'], {
        cwd: repoPath,
        streamOutput: false,
      });

      // Build the project
      this.context.logger.info('Building Intents Protocol simulator...');
      await this.context.commandExecutor.execute('npm', ['run', 'build'], {
        cwd: repoPath,
        streamOutput: false,
      });

      // Generate intents configuration
      await this.generateIntentsConfig(repoPath, chainSignaturesOutputs);

      // Run deployment script if specified
      const scriptPath = this.context.layerConfig.source.script_path;
      if (scriptPath && this.fileExists(path.join(repoPath, scriptPath))) {
        this.context.logger.info('Running Intents deployment script...');
        
        const env = this.prepareEnvironment(chainSignaturesOutputs);
        const scriptResult = await this.executeScript(repoPath, scriptPath, {
          env,
          cwd: repoPath,
        });

        if (!scriptResult.success) {
          this.context.logger.warn(`Deployment script returned warnings: ${scriptResult.error}`);
          // Don't fail - script may be optional
        }
      }

      const duration = Date.now() - startTime;
      this.context.logger.completeOperation('Intents Protocol Layer configuration', duration);

      return {
        success: true,
        duration,
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.context.logger.failOperation('Intents Protocol Layer configuration', error);
      return {
        success: false,
        error: error.message,
        duration,
      };
    }
  }

  /**
   * Generate configuration for Intents Protocol
   */
  private async generateIntentsConfig(repoPath: string, chainSignaturesOutputs: LayerOutput): Promise<void> {
    const configPath = path.join(repoPath, 'intents-config.json');

    this.context.logger.info('Generating Intents Protocol configuration');

    const layerConfig = this.context.layerConfig.config;

    const config = {
      mode: layerConfig.mode || 'simulator',
      
      // Chain Signatures configuration from Layer 3
      chainSignaturesConfig: {
        rpcUrl: chainSignaturesOutputs.outputs.near_rpc_url,
        mpcContractId: chainSignaturesOutputs.outputs.v1_signer_contract_id,
        mpcNodeCount: chainSignaturesOutputs.outputs.mpc_node_count,
      },
      
      // Supported chains and assets
      supportedChains: this.getSupportedChains(),
      supportedAssets: this.getSupportedAssets(),
      
      // Protocol configuration
      protocols: {
        ethereum: {
          enabled: layerConfig.enable_ethereum !== false,
          networks: ['mainnet', 'sepolia'],
        },
        bitcoin: {
          enabled: layerConfig.enable_bitcoin !== false,
          networks: ['mainnet', 'testnet'],
        },
        dogecoin: {
          enabled: layerConfig.enable_dogecoin === true,
          networks: ['mainnet', 'testnet'],
        },
      },
      
      // Timestamp
      generatedAt: new Date().toISOString(),
    };

    await this.writeConfigFile(configPath, config);
    this.context.logger.success(`Intents configuration written to: ${configPath}`);
  }

  /**
   * Prepare environment variables
   */
  private prepareEnvironment(chainSignaturesOutputs: LayerOutput): Record<string, string> {
    return {
      NEAR_RPC_URL: chainSignaturesOutputs.outputs.near_rpc_url || '',
      MPC_CONTRACT_ID: chainSignaturesOutputs.outputs.v1_signer_contract_id || '',
      INTENTS_MODE: this.context.layerConfig.config.mode || 'simulator',
      NODE_ENV: 'production',
    };
  }

  /**
   * Get list of supported chains
   */
  private getSupportedChains(): string[] {
    const chains = ['near'];
    const config = this.context.layerConfig.config;

    if (config.enable_ethereum !== false) chains.push('ethereum');
    if (config.enable_bitcoin !== false) chains.push('bitcoin');
    if (config.enable_dogecoin === true) chains.push('dogecoin');

    return chains;
  }

  /**
   * Get list of supported assets
   */
  private getSupportedAssets(): string[] {
    return [
      'near:native',
      'near:wrap.near',
      'ethereum:native',
      'ethereum:usdc.eth',
      'bitcoin:native',
    ];
  }

  /**
   * Get outputs from configured Intents Protocol
   */
  async getOutputs(): Promise<LayerOutput> {
    this.context.logger.info('Reading Intents Protocol Layer outputs');

    try {
      const repoUrl = this.context.layerConfig.source.repo_url;
      const repoName = this.extractRepoName(repoUrl);
      const repoPath = path.join(this.context.globalConfig.workspace_root, repoName);

      const outputs: Record<string, string> = {
        deployed: 'true',
        deploy_timestamp: new Date().toISOString(),
        mode: this.context.layerConfig.config.mode || 'simulator',
        intents_simulator_ready: 'true',
        supported_chains: this.getSupportedChains().join(','),
        supported_assets: this.getSupportedAssets().join(','),
      };

      // Try to read the generated config
      const configPath = path.join(repoPath, 'intents-config.json');
      const fs = require('fs');
      if (fs.existsSync(configPath)) {
        outputs.config_path = configPath;
      }

      // Add Chain Signatures info from dependency
      const chainSignaturesOutputs = this.getDependencyOutputs('chain_signatures');
      if (chainSignaturesOutputs) {
        outputs.chain_signatures_contract_id = chainSignaturesOutputs.outputs.v1_signer_contract_id || '';
      }

      this.context.logger.success('Intents Protocol configured successfully');

      return this.createLayerOutput(outputs);

    } catch (error: any) {
      this.context.logger.error('Failed to read Intents Protocol Layer outputs', error);
      throw new Error(`Failed to get Intents Protocol outputs: ${error.message}`);
    }
  }

  /**
   * Destroy Intents Protocol configuration
   */
  async destroy(): Promise<{ success: boolean; error?: string }> {
    this.context.logger.startOperation('Destroying Intents Protocol Layer');

    try {
      const repoUrl = this.context.layerConfig.source.repo_url;
      const repoName = this.extractRepoName(repoUrl);
      const repoPath = path.join(this.context.globalConfig.workspace_root, repoName);

      // Clean up generated files
      const fs = require('fs');
      const filesToClean = [
        'intents-config.json',
        'dist/',
        'node_modules/',
      ];

      for (const file of filesToClean) {
        const filePath = path.join(repoPath, file);
        try {
          if (fs.existsSync(filePath)) {
            if (fs.statSync(filePath).isDirectory()) {
              fs.rmSync(filePath, { recursive: true, force: true });
            } else {
              fs.unlinkSync(filePath);
            }
            this.context.logger.debug(`Cleaned up: ${file}`);
          }
        } catch (error) {
          this.context.logger.warn(`Failed to clean up ${file}`, error);
        }
      }

      this.context.logger.success('Intents Protocol Layer destroyed successfully');
      return { success: true };

    } catch (error: any) {
      this.context.logger.failOperation('Intents Protocol Layer destruction', error);
      return { success: false, error: error.message };
    }
  }
}

