/**
 * Abstract base class for all layer implementations
 */
import { Logger } from '../utils/Logger';
import { GitManager } from '../utils/GitManager';
import { HealthChecker } from '../utils/HealthChecker';
import { CdkManager } from '../aws/CdkManager';
import { StackOutputReader } from '../aws/StackOutputReader';
import { CommandExecutor } from '../utils/CommandExecutor';
import { ConfigManager } from '../config/ConfigManager';
import { LayerConfig, GlobalConfig, LayerOutput, VerifyResult, DeployResult } from '../types';
export interface LayerContext {
    globalConfig: GlobalConfig;
    layerConfig: LayerConfig;
    configManager: ConfigManager;
    logger: Logger;
    gitManager: GitManager;
    healthChecker: HealthChecker;
    cdkManager: CdkManager;
    stackReader: StackOutputReader;
    commandExecutor: CommandExecutor;
    getLayerOutputs: (layerName: string) => LayerOutput | undefined;
}
export declare abstract class BaseLayer {
    protected context: LayerContext;
    protected layerName: string;
    constructor(layerName: string, context: LayerContext);
    /**
     * Get the layer name
     */
    getLayerName(): string;
    /**
     * Get the layer configuration
     */
    getLayerConfig(): LayerConfig;
    /**
     * Get the global configuration
     */
    getGlobalConfig(): GlobalConfig;
    /**
     * Verify if this layer is already healthy/running
     * Returns a result indicating whether deployment should be skipped
     */
    abstract verify(): Promise<VerifyResult>;
    /**
     * Deploy this layer
     * Should handle all deployment logic specific to this layer
     */
    abstract deploy(): Promise<DeployResult>;
    /**
     * Get outputs from this layer after deployment
     * Returns structured output data that other layers can consume
     */
    abstract getOutputs(): Promise<LayerOutput>;
    /**
     * Destroy this layer
     * Should clean up all resources created by this layer
     */
    abstract destroy(): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Get dependencies for this layer
     */
    getDependencies(): string[];
    /**
     * Check if this layer is enabled
     */
    isEnabled(): boolean;
    /**
     * Helper method to run a health check on a URL
     */
    protected runHealthCheck(url: string, type?: 'rpc' | 'http' | 'mpc', options?: any): Promise<boolean>;
    /**
     * Helper method to read CloudFormation stack outputs
     */
    protected readStackOutputs(stackName: string): Promise<Record<string, string>>;
    /**
     * Helper method to get outputs from a dependency layer
     */
    protected getDependencyOutputs(dependencyName: string): LayerOutput | undefined;
    /**
     * Helper method to ensure a repository is cloned and ready
     */
    protected ensureRepository(repoUrl: string, branch?: string): Promise<string>;
    /**
     * Helper method to deploy CDK stacks for this layer
     */
    protected deployCdkStacks(repoPath: string, cdkRelativePath: string, options?: {
        stacks?: string[];
        context?: Record<string, string>;
    }): Promise<DeployResult>;
    /**
     * Helper method to execute a script in a repository
     */
    protected executeScript(repoPath: string, scriptPath: string, options?: {
        args?: string[];
        env?: Record<string, string>;
        cwd?: string;
    }): Promise<{
        success: boolean;
        stdout: string;
        stderr: string;
        error?: string;
    }>;
    /**
     * Helper method to write a JSON config file
     */
    protected writeConfigFile(filePath: string, config: any): Promise<void>;
    /**
     * Helper method to check if a file exists
     */
    protected fileExists(filePath: string): boolean;
    /**
     * Extract repository name from URL
     */
    protected extractRepoName(repoUrl: string): string;
    /**
     * Create a standardized LayerOutput
     */
    protected createLayerOutput(outputs: Record<string, string>): LayerOutput;
}
//# sourceMappingURL=BaseLayer.d.ts.map