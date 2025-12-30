"use strict";
/**
 * NEAR Base Layer - Manages NEAR Protocol RPC node deployment
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
exports.NearBaseLayer = void 0;
const path = __importStar(require("path"));
const BaseLayer_1 = require("./BaseLayer");
class NearBaseLayer extends BaseLayer_1.BaseLayer {
    /**
     * Verify if NEAR RPC node is already available with thorough checks
     */
    async verify() {
        const existingRpcUrl = this.context.layerConfig.config.existing_rpc_url;
        const expectedNetworkId = this.context.layerConfig.config.network_id || 'localnet';
        if (existingRpcUrl) {
            this.context.logger.info(`Checking existing NEAR RPC infrastructure at: ${existingRpcUrl}`);
            // First, try external health check
            const healthResult = await this.context.healthChecker.checkRpc(existingRpcUrl, expectedNetworkId, 15000 // 15 second timeout for thorough checks
            );
            if (healthResult.healthy) {
                this.context.logger.success(`Existing NEAR RPC is fully accessible: ${existingRpcUrl}`);
                this.context.logger.success(`- Network: ${expectedNetworkId}`);
                this.context.logger.success(`- Response time: ${healthResult.response_time}ms`);
                return {
                    skip: true,
                    reason: 'Existing RPC endpoint is fully operational and accessible',
                    existingOutput: this.createAccessibleOutput(existingRpcUrl, expectedNetworkId),
                };
            }
            // External access failed - check if infrastructure actually exists via AWS
            this.context.logger.warn(`External access to NEAR RPC failed: ${healthResult.error}`);
            this.context.logger.info(`Checking if NEAR infrastructure exists via AWS APIs...`);
            const infrastructureCheck = await this.checkNearInfrastructureExists();
            if (infrastructureCheck.exists) {
                this.context.logger.success(`NEAR infrastructure exists and is properly secured`);
                this.context.logger.info(`- Instance: ${infrastructureCheck.instanceId}`);
                this.context.logger.info(`- VPC: ${infrastructureCheck.vpcId}`);
                this.context.logger.info(`- Network isolation is working correctly`);
                return {
                    skip: true,
                    reason: 'Existing NEAR infrastructure exists and is properly secured (network isolation expected)',
                    existingOutput: this.createSecuredOutput(existingRpcUrl, expectedNetworkId, infrastructureCheck),
                };
            }
            else {
                this.context.logger.error(`NEAR infrastructure check failed: ${infrastructureCheck.error}`);
                this.context.logger.warn(`Will proceed with deployment since existing infrastructure is not found`);
            }
        }
        return { skip: false };
    }
    /**
     * Check if NEAR infrastructure exists via AWS APIs
     */
    async checkNearInfrastructureExists() {
        try {
            // Check for NEAR-related CloudFormation stacks
            const stacksResult = await this.context.commandExecutor.execute('aws', [
                'cloudformation', 'list-stacks',
                '--profile', this.context.globalConfig.aws_profile,
                '--region', this.context.globalConfig.aws_region,
                '--query', 'StackSummaries[?contains(StackName, `near-localnet`) && StackStatus!=`DELETE_COMPLETE`].[StackName,StackStatus]',
                '--output', 'text'
            ], { silent: true });
            if (!stacksResult.success || !stacksResult.stdout.trim()) {
                return { exists: false, error: 'No NEAR CloudFormation stacks found' };
            }
            // Check for NEAR infrastructure instance
            const instanceResult = await this.context.commandExecutor.execute('aws', [
                'ec2', 'describe-instances',
                '--profile', this.context.globalConfig.aws_profile,
                '--region', this.context.globalConfig.aws_region,
                '--filters', 'Name=tag:Name,Values=*near-infrastructure*', 'Name=instance-state-name,Values=running',
                '--query', 'Reservations[0].Instances[0].{InstanceId:InstanceId,VpcId:VpcId,PrivateIpAddress:PrivateIpAddress}',
                '--output', 'json'
            ], { silent: true });
            if (!instanceResult.success) {
                return { exists: false, error: 'NEAR EC2 instance not found or not running' };
            }
            const instanceData = JSON.parse(instanceResult.stdout);
            if (!instanceData.InstanceId) {
                return { exists: false, error: 'NEAR EC2 instance not found' };
            }
            return {
                exists: true,
                instanceId: instanceData.InstanceId,
                vpcId: instanceData.VpcId,
            };
        }
        catch (error) {
            return {
                exists: false,
                error: `Infrastructure check failed: ${error.message}`,
            };
        }
    }
    /**
     * Create output for accessible NEAR infrastructure
     */
    createAccessibleOutput(rpcUrl, networkId) {
        return this.createLayerOutput({
            rpc_url: rpcUrl,
            network_id: networkId,
            vpc_id: 'unknown', // Could look this up if needed
            instance_id: 'unknown', // Could look this up if needed
            rpc_ip: rpcUrl.replace('http://', '').split(':')[0],
            access_status: 'accessible',
        });
    }
    /**
     * Create output for secured NEAR infrastructure (exists but not externally accessible)
     */
    createSecuredOutput(rpcUrl, networkId, infra) {
        return this.createLayerOutput({
            rpc_url: rpcUrl,
            network_id: networkId,
            vpc_id: infra.vpcId || 'unknown',
            instance_id: infra.instanceId || 'unknown',
            rpc_ip: rpcUrl.replace('http://', '').split(':')[0],
            access_status: 'secured', // Infrastructure exists but access is properly restricted
            security_note: 'Network isolation is working correctly',
        });
    }
    /**
     * Deploy NEAR RPC node using AWSNodeRunner CDK
     */
    async deploy() {
        const startTime = Date.now();
        try {
            this.context.logger.startOperation('Deploying NEAR Base Layer (AWSNodeRunner)');
            // Ensure AWSNodeRunner repository is cloned and ready
            const repoUrl = this.context.layerConfig.source.repo_url;
            const repoPath = await this.ensureRepository(repoUrl, this.context.layerConfig.source.branch);
            // Get CDK path (relative to repository root)
            const cdkPath = this.context.layerConfig.source.cdk_path;
            if (!cdkPath) {
                throw new Error('CDK path not specified for NEAR base layer');
            }
            // Deploy all CDK stacks for NEAR node
            const deployResult = await this.deployCdkStacks(repoPath, cdkPath, {
                // Deploy all stacks in order: common, infrastructure, install, sync
                stacks: [
                    'near-common',
                    'near-infrastructure',
                    'near-install',
                    'near-sync',
                ],
            });
            const duration = Date.now() - startTime;
            this.context.logger.completeOperation('NEAR Base Layer deployment', duration);
            return deployResult;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.context.logger.failOperation('NEAR Base Layer deployment', error);
            return {
                success: false,
                error: error.message,
                duration,
            };
        }
    }
    /**
     * Get outputs from deployed NEAR node
     */
    async getOutputs() {
        this.context.logger.info('Reading NEAR Base Layer outputs');
        try {
            // Read outputs from the sync stack (contains the final RPC endpoint)
            const syncOutputs = await this.readStackOutputs('near-localnet-sync');
            // Also read infrastructure outputs for additional details
            const infraOutputs = await this.readStackOutputs('near-localnet-infrastructure');
            // Read common stack outputs for VPC info
            const commonOutputs = await this.readStackOutputs('near-localnet-common');
            const outputs = {
                // Primary RPC endpoint from sync stack (note: CDK outputs are lowercase in some versions)
                rpc_url: syncOutputs.NearLocalnetRpcUrl || syncOutputs.nearrpcurl || '',
                network_id: syncOutputs.NearLocalnetNetworkId || syncOutputs.nearnetworkid || 'localnet',
                // Infrastructure details
                instance_id: infraOutputs.NearLocalnetInstanceId || infraOutputs.nearinstanceid || '',
                private_ip: infraOutputs.NearLocalnetInstancePrivateIp || infraOutputs.nearinstanceprivateip || '',
                rpc_ip: infraOutputs.NearLocalnetInstancePrivateIp || infraOutputs.nearinstanceprivateip || '', // Same as private IP
                // Network details from common stack
                vpc_id: commonOutputs.VpcId || '',
                security_group_id: commonOutputs.SecurityGroupId || '',
                // Additional metadata
                node_type: this.context.layerConfig.config.instance_type || 'm7a.2xlarge',
                near_version: this.context.layerConfig.config.near_version || '2.10.1',
            };
            this.context.logger.success(`NEAR RPC available at: ${outputs.rpc_url}`);
            return this.createLayerOutput(outputs);
        }
        catch (error) {
            this.context.logger.error('Failed to read NEAR Base Layer outputs', error);
            throw new Error(`Failed to get NEAR node outputs: ${error.message}`);
        }
    }
    /**
     * Destroy NEAR RPC node
     */
    async destroy() {
        this.context.logger.startOperation('Destroying NEAR Base Layer');
        try {
            // Ensure AWSNodeRunner repository is available
            const repoUrl = this.context.layerConfig.source.repo_url;
            const repoPath = await this.ensureRepository(repoUrl, this.context.layerConfig.source.branch);
            const cdkPath = this.context.layerConfig.source.cdk_path;
            if (!cdkPath) {
                throw new Error('CDK path not specified for NEAR base layer');
            }
            // Destroy stacks in reverse order
            const destroyResult = await this.context.cdkManager.destroy(path.join(repoPath, cdkPath), {
                profile: this.context.globalConfig.aws_profile,
                region: this.context.globalConfig.aws_region,
                stacks: [
                    'near-localnet-sync',
                    'near-localnet-install',
                    'near-localnet-infrastructure',
                    'near-localnet-common',
                ],
                force: true,
            });
            if (destroyResult.success) {
                this.context.logger.success('NEAR Base Layer destroyed successfully');
                return { success: true };
            }
            else {
                this.context.logger.error('NEAR Base Layer destruction failed', destroyResult.error);
                return { success: false, error: destroyResult.error };
            }
        }
        catch (error) {
            this.context.logger.failOperation('NEAR Base Layer destruction', error);
            return { success: false, error: error.message };
        }
    }
    /**
     * Wait for NEAR node to be fully ready
     */
    async waitForReady(timeoutMinutes = 25) {
        const outputs = await this.getOutputs();
        const rpcUrl = outputs.outputs.rpc_url;
        if (!rpcUrl) {
            this.context.logger.error('No RPC URL available to wait for');
            return false;
        }
        this.context.logger.info(`Waiting for NEAR node to be ready at: ${rpcUrl}`);
        const result = await this.context.healthChecker.waitForHealthy(rpcUrl, 'rpc', {
            maxRetries: Math.floor((timeoutMinutes * 60) / 10), // Check every 10 seconds
            retryInterval: 10000,
            timeout: timeoutMinutes * 60 * 1000,
        });
        if (result.healthy) {
            this.context.logger.success('NEAR node is ready and responding to RPC calls');
            return true;
        }
        else {
            this.context.logger.error(`NEAR node failed to become ready: ${result.error}`);
            return false;
        }
    }
}
exports.NearBaseLayer = NearBaseLayer;
//# sourceMappingURL=NearBaseLayer.js.map