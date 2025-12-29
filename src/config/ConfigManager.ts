/**
 * Configuration manager for loading and validating the orchestrator config
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { SimulatorsConfigSchema, validateConfig, validateConfigSafe, type SimulatorsConfig } from './schema';
import { Logger } from '../utils/Logger';

export class ConfigManager {
  private logger: Logger;
  private configPath: string;
  private configCache?: SimulatorsConfig;

  constructor(configPath?: string, logger?: Logger) {
    this.logger = logger || new Logger('ConfigManager');
    this.configPath = configPath || path.join(process.cwd(), 'config', 'simulators.config.yaml');
  }

  /**
   * Load and validate the configuration file
   */
  async load(): Promise<SimulatorsConfig> {
    try {
      if (!fs.existsSync(this.configPath)) {
        throw new Error(`Configuration file not found: ${this.configPath}`);
      }

      this.logger.debug(`Loading configuration from ${this.configPath}`);

      const fileContents = fs.readFileSync(this.configPath, 'utf-8');
      const rawConfig = yaml.load(fileContents);

      if (!rawConfig || typeof rawConfig !== 'object') {
        throw new Error('Configuration file is empty or invalid YAML');
      }

      // Validate the configuration
      const config = validateConfig(rawConfig);

      // Apply environment variable interpolation
      const interpolatedConfig = this.interpolateEnvironmentVariables(config);

      // Cache the validated config
      this.configCache = interpolatedConfig;

      this.logger.info('Configuration loaded and validated successfully');
      return interpolatedConfig;

    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to load configuration: ${error.message}`);
        throw new Error(`Configuration validation failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Load configuration with safe error handling
   */
  async loadSafe(): Promise<{ success: boolean; config?: SimulatorsConfig; error?: string }> {
    try {
      const config = await this.load();
      return { success: true, config };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Configuration loading failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get cached configuration or load it
   */
  async get(): Promise<SimulatorsConfig> {
    if (this.configCache) {
      return this.configCache;
    }
    return this.load();
  }

  /**
   * Validate configuration without loading from file
   */
  validate(config: unknown): { success: boolean; config?: SimulatorsConfig; errors?: string[] } {
    const result = validateConfigSafe(config);

    if (result.success) {
      return { success: true, config: result.data };
    } else {
      const errors = result.error?.errors.map(err => `${err.path.join('.')}: ${err.message}`) || ['Unknown validation error'];
      return { success: false, errors };
    }
  }

  /**
   * Get the list of enabled layers in dependency order
   */
  getEnabledLayers(): string[] {
    if (!this.configCache) {
      throw new Error('Configuration not loaded. Call load() first.');
    }

    const enabledLayers = Object.entries(this.configCache.layers)
      .filter(([, config]) => config.enabled)
      .map(([name]) => name);

    // Sort by dependencies (simple topological sort)
    return this.topologicalSort(enabledLayers, this.configCache.layers);
  }

  /**
   * Get dependencies for a specific layer
   */
  getLayerDependencies(layerName: string): string[] {
    if (!this.configCache) {
      throw new Error('Configuration not loaded. Call load() first.');
    }

    const layer = this.configCache.layers[layerName];
    if (!layer) {
      throw new Error(`Layer '${layerName}' not found in configuration`);
    }

    return layer.depends_on || [];
  }

  /**
   * Interpolate environment variables in configuration values
   */
  private interpolateEnvironmentVariables(config: SimulatorsConfig): SimulatorsConfig {
    const interpolateValue = (value: any): any => {
      if (typeof value === 'string') {
        // Replace ${VAR_NAME} or $VAR_NAME with environment variables
        return value.replace(/\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g, (match, braced, bare) => {
          const varName = braced || bare;
          const envValue = process.env[varName];
          if (envValue !== undefined) {
            this.logger.debug(`Interpolated environment variable: ${varName}`);
            return envValue;
          }
          // Leave unsubstituted if not found
          return match;
        });
      } else if (Array.isArray(value)) {
        return value.map(interpolateValue);
      } else if (value && typeof value === 'object') {
        const result: any = {};
        for (const [key, val] of Object.entries(value)) {
          result[key] = interpolateValue(val);
        }
        return result;
      }
      return value;
    };

    return interpolateValue(config);
  }

  /**
   * Simple topological sort for layer dependencies
   */
  private topologicalSort(layerNames: string[], allLayers: Record<string, any>): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];

    const visit = (layerName: string) => {
      if (visited.has(layerName)) return;
      if (visiting.has(layerName)) {
        throw new Error(`Circular dependency detected involving layer '${layerName}'`);
      }

      visiting.add(layerName);

      const dependencies = allLayers[layerName]?.depends_on || [];
      for (const dep of dependencies) {
        if (layerNames.includes(dep)) {
          visit(dep);
        }
      }

      visiting.delete(layerName);
      visited.add(layerName);
      result.push(layerName);
    };

    for (const layerName of layerNames) {
      visit(layerName);
    }

    return result;
  }
}
