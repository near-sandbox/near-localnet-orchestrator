/**
 * Configuration manager for loading and validating the orchestrator config
 */
import { type SimulatorsConfig } from './schema';
import { Logger } from '../utils/Logger';
export declare class ConfigManager {
    private logger;
    private configPath;
    private configCache?;
    constructor(configPath?: string, logger?: Logger);
    /**
     * Load and validate the configuration file
     */
    load(): Promise<SimulatorsConfig>;
    /**
     * Load configuration with safe error handling
     */
    loadSafe(): Promise<{
        success: boolean;
        config?: SimulatorsConfig;
        error?: string;
    }>;
    /**
     * Get cached configuration or load it
     */
    get(): Promise<SimulatorsConfig>;
    /**
     * Validate configuration without loading from file
     */
    validate(config: unknown): {
        success: boolean;
        config?: SimulatorsConfig;
        errors?: string[];
    };
    /**
     * Get the list of enabled layers in dependency order
     */
    getEnabledLayers(): string[];
    /**
     * Get dependencies for a specific layer
     */
    getLayerDependencies(layerName: string): string[];
    /**
     * Interpolate environment variables in configuration values
     */
    private interpolateEnvironmentVariables;
    /**
     * Simple topological sort for layer dependencies
     */
    private topologicalSort;
}
//# sourceMappingURL=ConfigManager.d.ts.map