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
import { BaseLayer } from './BaseLayer';
import { VerifyResult, DeployResult, LayerOutput } from '../types';
export declare class NearServicesLayer extends BaseLayer {
    /**
     * Verify if NEAR Services are already deployed
     */
    verify(): Promise<VerifyResult>;
    /**
     * Deploy NEAR Services infrastructure
     */
    deploy(): Promise<DeployResult>;
    /**
     * Generate configuration for faucet deployment
     */
    private generateFaucetConfig;
    /**
     * Check if a CloudFormation stack exists
     */
    private checkStackExists;
    /**
     * Deploy NEAR core contracts for testnet/mainnet parity
     */
    private deployCoreContracts;
    /**
     * Ensure near/core-contracts repository is cloned
     */
    private ensureCoreContractsRepo;
    /**
     * Build core contracts (Rust -> WASM)
     */
    private buildCoreContracts;
    /**
     * Deploy contracts to localnet using node0 account
     */
    private deployContractsToLocalnet;
    /**
     * Get outputs from deployed NEAR Services
     */
    getOutputs(): Promise<LayerOutput>;
    /**
     * Destroy NEAR Services infrastructure
     */
    destroy(): Promise<{
        success: boolean;
        error?: string;
    }>;
}
//# sourceMappingURL=NearServicesLayer.d.ts.map