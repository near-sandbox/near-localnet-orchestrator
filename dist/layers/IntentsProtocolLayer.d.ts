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
import { BaseLayer } from './BaseLayer';
import { VerifyResult, DeployResult, LayerOutput } from '../types';
export declare class IntentsProtocolLayer extends BaseLayer {
    /**
     * Verify if Intents Protocol is already configured
     */
    verify(): Promise<VerifyResult>;
    /**
     * Deploy/Configure Intents Protocol
     */
    deploy(): Promise<DeployResult>;
    /**
     * Generate configuration for Intents Protocol
     */
    private generateIntentsConfig;
    /**
     * Prepare environment variables
     */
    private prepareEnvironment;
    /**
     * Get list of supported chains
     */
    private getSupportedChains;
    /**
     * Get list of supported assets
     */
    private getSupportedAssets;
    /**
     * Get outputs from configured Intents Protocol
     */
    getOutputs(): Promise<LayerOutput>;
    /**
     * Destroy Intents Protocol configuration
     */
    destroy(): Promise<{
        success: boolean;
        error?: string;
    }>;
}
//# sourceMappingURL=IntentsProtocolLayer.d.ts.map