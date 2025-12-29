/**
 * NEAR Base Layer - Manages NEAR Protocol RPC node deployment
 */
import { BaseLayer } from './BaseLayer';
import { VerifyResult, DeployResult, LayerOutput } from '../types';
export declare class NearBaseLayer extends BaseLayer {
    /**
     * Verify if NEAR RPC node is already available with thorough checks
     */
    verify(): Promise<VerifyResult>;
    /**
     * Check if NEAR infrastructure exists via AWS APIs
     */
    private checkNearInfrastructureExists;
    /**
     * Create output for accessible NEAR infrastructure
     */
    private createAccessibleOutput;
    /**
     * Create output for secured NEAR infrastructure (exists but not externally accessible)
     */
    private createSecuredOutput;
    /**
     * Deploy NEAR RPC node using AWSNodeRunner CDK
     */
    deploy(): Promise<DeployResult>;
    /**
     * Get outputs from deployed NEAR node
     */
    getOutputs(): Promise<LayerOutput>;
    /**
     * Destroy NEAR RPC node
     */
    destroy(): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Wait for NEAR node to be fully ready
     */
    waitForReady(timeoutMinutes?: number): Promise<boolean>;
}
//# sourceMappingURL=NearBaseLayer.d.ts.map