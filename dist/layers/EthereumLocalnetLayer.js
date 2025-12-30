"use strict";
/**
 * Ethereum Localnet Layer
 *
 * Deploys a single Geth node in --dev mode on AWS.
 * Used for cross-chain signature testing.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.EthereumLocalnetLayer = void 0;
const path = __importStar(require("path"));
const BaseLayer_1 = require("./BaseLayer");
class EthereumLocalnetLayer extends BaseLayer_1.BaseLayer {
    /**
     * Verify if Ethereum Localnet is already deployed
     */
    async verify() {
        const existingRpcUrl = this.context.layerConfig.config.existing_rpc_url;
        if (existingRpcUrl) {
            this.context.logger.info(`Checking existing Ethereum RPC at: ${existingRpcUrl}`);
            const healthResult = await this.runHealthCheck(existingRpcUrl, 'http'); // Basic check
            if (healthResult) {
                return {
                    skip: true,
                    reason: 'Existing Ethereum RPC endpoint is operational',
                    existingOutput: this.createExistingOutput(existingRpcUrl),
                };
            }
        }
        // Check if stack exists via AWS
        const stackExists = await this.checkStackExists('ethereum-localnet');
        if (stackExists) {
            this.context.logger.info('Ethereum stack exists, reading outputs...');
            try {
                const outputs = await this.getOutputs();
                return {
                    skip: true,
                    reason: 'Ethereum infrastructure already deployed',
                    existingOutput: outputs,
                };
            }
            catch (error) {
                this.context.logger.warn('Could not read Ethereum stack outputs, will deploy');
            }
        }
        return { skip: false };
    }
    /**
     * Deploy Ethereum Localnet infrastructure
     */
    async deploy() {
        const startTime = Date.now();
        try {
            this.context.logger.startOperation('Deploying Ethereum Localnet Layer');
            // Ensure repository
            const repoUrl = this.context.layerConfig.source.repo_url;
            const repoPath = await this.ensureRepository(repoUrl, this.context.layerConfig.source.branch);
            const cdkPath = this.context.layerConfig.source.cdk_path;
            if (!cdkPath) {
                throw new Error('CDK path not specified for Ethereum Localnet layer');
            }
            // Get VPC from NEAR Base (if available, otherwise fallback to default/config)
            // Usually we want Eth node in the SAME VPC as MPC nodes (which are in NEAR VPC)
            let vpcId = this.context.layerConfig.config.vpc_id;
            // If we depend on near_base, use its VPC
            const nearOutputs = this.getDependencyOutputs('near_base');
            if (nearOutputs && nearOutputs.outputs.vpc_id) {
                vpcId = nearOutputs.outputs.vpc_id;
                this.context.logger.info(`Using NEAR Base VPC: ${vpcId}`);
            }
            if (!vpcId) {
                this.context.logger.warn('No VPC ID found from dependencies or config. Stack might fail or use default.');
            }
            // Context for CDK
            const context = {
                'vpcId': vpcId,
                'instanceType': this.context.layerConfig.config.instance_type || 't3.medium',
                'accountId': this.context.globalConfig.aws_account,
                'region': this.context.globalConfig.aws_region,
            };
            // Deploy CDK stack
            this.context.logger.info('Deploying Ethereum infrastructure...');
            const deployResult = await this.deployCdkStacks(repoPath, cdkPath, {
                stacks: ['EthereumLocalnetStack'],
                context: context,
            });
            const duration = Date.now() - startTime;
            this.context.logger.completeOperation('Ethereum Localnet Layer deployment', duration);
            return deployResult;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.context.logger.failOperation('Ethereum Localnet Layer deployment', error);
            return {
                success: false,
                error: error.message,
                duration,
            };
        }
    }
    /**
     * Get outputs from deployed Ethereum Localnet
     */
    async getOutputs() {
        this.context.logger.info('Reading Ethereum Localnet Layer outputs');
        try {
            const stackOutputs = await this.readStackOutputs('ethereum-localnet');
            const outputs = {
                deployed: 'true',
                deploy_timestamp: new Date().toISOString(),
                eth_rpc_url: stackOutputs.GethLocalnetRpcUrl || '',
                eth_instance_id: stackOutputs.GethLocalnetInstanceId || '',
                eth_private_ip: stackOutputs.GethLocalnetPrivateIp || '',
                eth_chain_id: stackOutputs.GethLocalnetChainId || '1337',
            };
            if (outputs.eth_rpc_url) {
                this.context.logger.success(`Ethereum RPC available at: ${outputs.eth_rpc_url}`);
            }
            return this.createLayerOutput(outputs);
        }
        catch (error) {
            this.context.logger.error('Failed to read Ethereum Localnet Layer outputs', error);
            throw new Error(`Failed to get Ethereum outputs: ${error.message}`);
        }
    }
    /**
     * Destroy Ethereum Localnet infrastructure
     */
    async destroy() {
        this.context.logger.startOperation('Destroying Ethereum Localnet Layer');
        try {
            const repoUrl = this.context.layerConfig.source.repo_url;
            const repoPath = await this.ensureRepository(repoUrl, this.context.layerConfig.source.branch);
            const cdkPath = this.context.layerConfig.source.cdk_path;
            if (!cdkPath) {
                throw new Error('CDK path not specified for Ethereum Localnet layer');
            }
            const destroyResult = await this.context.cdkManager.destroy(path.join(repoPath, cdkPath), {
                profile: this.context.globalConfig.aws_profile,
                region: this.context.globalConfig.aws_region,
                stacks: ['ethereum-localnet'],
                force: true,
            });
            if (destroyResult.success) {
                this.context.logger.success('Ethereum Localnet Layer destroyed successfully');
                return { success: true };
            }
            else {
                return { success: false, error: destroyResult.error };
            }
        }
        catch (error) {
            this.context.logger.failOperation('Ethereum Localnet Layer destruction', error);
            return { success: false, error: error.message };
        }
    }
    // Helper
    async checkStackExists(stackName) {
        try {
            const result = await this.context.commandExecutor.execute('aws', [
                'cloudformation', 'list-stacks',
                '--profile', this.context.globalConfig.aws_profile,
                '--region', this.context.globalConfig.aws_region,
                '--query', `StackSummaries[?StackName=='${stackName}' && StackStatus!='DELETE_COMPLETE']`,
                '--output', 'text'
            ], { silent: true });
            return result.success && result.stdout.trim().length > 0;
        }
        catch (error) {
            return false;
        }
    }
    createExistingOutput(rpcUrl) {
        return {
            layer_name: 'ethereum_localnet',
            deployed: true,
            outputs: {
                deployed: 'true',
                eth_rpc_url: rpcUrl,
                eth_chain_id: '1337', // Assumption
            },
            timestamp: new Date().toISOString(),
        };
    }
}
exports.EthereumLocalnetLayer = EthereumLocalnetLayer;
//# sourceMappingURL=EthereumLocalnetLayer.js.map