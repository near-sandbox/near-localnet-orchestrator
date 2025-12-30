/**
 * Ethereum Localnet Layer
 *
 * Deploys a single Geth node in --dev mode on AWS.
 * Used for cross-chain signature testing.
 */
import { BaseLayer } from './BaseLayer';
import { VerifyResult, DeployResult, LayerOutput } from '../types';
export declare class EthereumLocalnetLayer extends BaseLayer {
    /**
     * Verify if Ethereum Localnet is already deployed
     */
    verify(): Promise<VerifyResult>;
    /**
     * Deploy Ethereum Localnet infrastructure
     */
    deploy(): Promise<DeployResult>;
    /**
     * Get outputs from deployed Ethereum Localnet
     */
    getOutputs(): Promise<LayerOutput>;
    /**
     * Destroy Ethereum Localnet infrastructure
     */
    destroy(): Promise<{
        success: boolean;
        error?: string;
    }>;
    private checkStackExists;
    private createExistingOutput;
}
//# sourceMappingURL=EthereumLocalnetLayer.d.ts.map