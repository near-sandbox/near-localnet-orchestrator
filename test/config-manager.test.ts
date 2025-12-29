/**
 * Unit tests for ConfigManager
 */

import * as fs from 'fs';
import * as path from 'path';
import { ConfigManager } from '../src/config/ConfigManager';
import { Logger } from '../src/utils/Logger';

describe('ConfigManager', () => {
  const testConfigPath = path.join(__dirname, 'test-config.yaml');
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('Test');
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
  });

  describe('load()', () => {
    it('should load valid configuration', async () => {
      const validConfig = `
global:
  aws_profile: "test-profile"
  aws_region: "us-east-1"
  aws_account: "123456789012"
  workspace_root: "./workspace"
  log_level: "info"
  continue_on_error: false

layers:
  test_layer:
    enabled: true
    source:
      repo_url: "https://github.com/test/repo"
      branch: "main"
      cdk_path: "infra/cdk"
    config:
      key: "value"
`;

      fs.writeFileSync(testConfigPath, validConfig);

      const configManager = new ConfigManager(testConfigPath, logger);
      const result = await configManager.load();

      expect(result.global.aws_profile).toBe('test-profile');
      expect(result.global.aws_region).toBe('us-east-1');
      expect(result.layers.test_layer.enabled).toBe(true);
      expect(result.layers.test_layer.source.repo_url).toBe('https://github.com/test/repo');
    });

    it('should throw error for invalid configuration', async () => {
      const invalidConfig = `
global:
  aws_profile: "test-profile"
  # Missing required aws_account
layers:
  test_layer:
    enabled: true
`;

      fs.writeFileSync(testConfigPath, invalidConfig);

      const configManager = new ConfigManager(testConfigPath, logger);

      await expect(configManager.load()).rejects.toThrow();
    });

    it('should throw error for non-existent file', async () => {
      const configManager = new ConfigManager('/non/existent/path.yaml', logger);

      await expect(configManager.load()).rejects.toThrow('Configuration file not found');
    });
  });

  describe('validate()', () => {
    it('should validate correct config object', () => {
      const configManager = new ConfigManager('', logger);

      const validConfig = {
        global: {
          aws_profile: 'test-profile',
          aws_region: 'us-east-1',
          aws_account: '123456789012',
          workspace_root: './workspace',
          log_level: 'info' as const,
          continue_on_error: false,
        },
        layers: {
          test_layer: {
            enabled: true,
            source: {
              repo_url: 'https://github.com/test/repo',
              branch: 'main',
              cdk_path: 'infra/cdk',
            },
            config: { key: 'value' },
          },
        },
      };

      const result = configManager.validate(validConfig);

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
    });

    it('should reject invalid config object', () => {
      const configManager = new ConfigManager('', logger);

      const invalidConfig = {
        global: {
          aws_profile: 'test-profile',
          // Missing required fields
        },
        layers: {},
      };

      const result = configManager.validate(invalidConfig);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });

  describe('getEnabledLayers()', () => {
    it('should return enabled layers in dependency order', async () => {
      const configWithDeps = `
global:
  aws_profile: "test-profile"
  aws_region: "us-east-1"
  aws_account: "123456789012"

layers:
  base_layer:
    enabled: true
    source:
      repo_url: "https://github.com/test/base"
      branch: "main"
    config: {}

  dependent_layer:
    enabled: true
    depends_on: ["base_layer"]
    source:
      repo_url: "https://github.com/test/dependent"
      branch: "main"
    config: {}

  disabled_layer:
    enabled: false
    source:
      repo_url: "https://github.com/test/disabled"
      branch: "main"
    config: {}
`;

      fs.writeFileSync(testConfigPath, configWithDeps);

      const configManager = new ConfigManager(testConfigPath, logger);
      await configManager.load();

      const enabledLayers = configManager.getEnabledLayers();

      expect(enabledLayers).toEqual(['base_layer', 'dependent_layer']);
      expect(enabledLayers).not.toContain('disabled_layer');
    });
  });
});
