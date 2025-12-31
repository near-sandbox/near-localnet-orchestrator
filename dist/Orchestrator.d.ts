/**
 * Main orchestrator for managing layered NEAR Protocol deployments
 */
import { LayerOutput, VerifyResult } from './types';
export interface OrchestratorOptions {
    configPath?: string;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    dryRun?: boolean;
    continueOnError?: boolean;
    awsProfile?: string;
    awsRegion?: string;
}
export declare class Orchestrator {
    private configManager;
    private logger;
    private gitManager;
    private healthChecker;
    private cdkManager;
    private stackReader;
    private commandExecutor;
    private config?;
    private layerOutputs;
    private deploymentState;
    constructor(options?: OrchestratorOptions);
    /**
     * Initialize the orchestrator by loading configuration
     */
    initialize(): Promise<void>;
    /**
     * Run the full orchestration process
     */
    run(targetLayers?: string[]): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Verify all layers without deploying
     */
    verify(targetLayers?: string[]): Promise<{
        success: boolean;
        results: Record<string, VerifyResult>;
    }>;
    /**
     * Destroy all deployed layers in reverse order
     */
    destroy(targetLayers?: string[]): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Get current deployment status
     */
    getStatus(): {
        layers: Record<string, LayerOutput>;
        timestamp: string;
    };
    /**
     * Process a single layer (verify -> deploy -> get outputs)
     */
    private processLayer;
    /**
     * Destroy a single layer
     */
    private destroyLayer;
    /**
     * Create a layer instance with proper context
     */
    private createLayerInstance;
    /**
     * Resolve dependencies and return execution order
     */
    private resolveDependencies;
    /**
     * Get all enabled layers
     */
    private getEnabledLayers;
    /**
     * Rollback layers that were successfully DEPLOYED (not skipped) during this run.
     *
     * This avoids destroying pre-existing dependency layers that were merely verified.
     */
    private rollbackFailedLayers;
    /**
     * Rollback all layers on critical failure
     */
    private rollbackAllLayers;
    /**
     * Load previous deployment state
     */
    private loadDeploymentState;
    /**
     * Save current deployment state
     */
    private saveDeploymentState;
    /**
     * Clean up deployment state file
     */
    private cleanupDeploymentState;
    /**
     * Get workspace root path
     */
    private getWorkspaceRoot;
}
//# sourceMappingURL=Orchestrator.d.ts.map