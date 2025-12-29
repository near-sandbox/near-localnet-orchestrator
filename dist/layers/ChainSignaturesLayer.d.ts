/**
 * Chain Signatures Layer (Layer 3)
 *
 * Manages cross-chain signing primitives including embedded MPC infrastructure.
 * This layer deploys the Chain Signatures API and MPC nodes together.
 *
 * Note: MPC infrastructure is EMBEDDED in this layer, not a separate layer.
 * The MPC nodes are deployed as part of the cross-chain-simulator repository.
 */
import { BaseLayer } from './BaseLayer';
import { VerifyResult, DeployResult, LayerOutput } from '../types';
export declare class ChainSignaturesLayer extends BaseLayer {
    /**
     * Verify if Chain Signatures infrastructure is already deployed
     */
    verify(): Promise<VerifyResult>;
    /**
     * Deploy Chain Signatures infrastructure (includes MPC nodes)
     */
    deploy(): Promise<DeployResult>;
    /**
     * Prepare environment variables for the deployment script
     */
    private prepareEnvironment;
    /**
     * Get outputs from deployed Chain Signatures infrastructure
     */
    getOutputs(): Promise<LayerOutput>;
    /**
     * Extract outputs from files created by the deployment script
     */
    private extractOutputsFromFiles;
    /**
     * Parse environment file content
     */
    private parseEnvFile;
    /**
     * Flatten a nested object into dot-notation keys
     */
    private flattenObject;
    /**
     * Destroy Chain Signatures infrastructure
     */
    destroy(): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Clean up generated files and artifacts
     */
    private cleanupGeneratedFiles;
}
//# sourceMappingURL=ChainSignaturesLayer.d.ts.map