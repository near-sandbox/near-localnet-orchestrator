"use strict";
/**
 * Abstract base class for all layer implementations
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseLayer = void 0;
const path = __importStar(require("path"));
class BaseLayer {
    constructor(layerName, context) {
        this.layerName = layerName;
        this.context = context;
    }
    /**
     * Get the layer name
     */
    getLayerName() {
        return this.layerName;
    }
    /**
     * Get the layer configuration
     */
    getLayerConfig() {
        return this.context.layerConfig;
    }
    /**
     * Get the global configuration
     */
    getGlobalConfig() {
        return this.context.globalConfig;
    }
    /**
     * Get dependencies for this layer
     */
    getDependencies() {
        return this.context.layerConfig.depends_on || [];
    }
    /**
     * Check if this layer is enabled
     */
    isEnabled() {
        return this.context.layerConfig.enabled;
    }
    /**
     * Helper method to run a health check on a URL
     */
    async runHealthCheck(url, type = 'http', options) {
        try {
            let result;
            if (type === 'rpc') {
                result = await this.context.healthChecker.checkRpc(url, options?.expectedNetworkId);
            }
            else if (type === 'mpc') {
                result = await this.context.healthChecker.checkMpcNode(url, options?.nearRpcUrl, options?.expectedContractId);
            }
            else {
                result = await this.context.healthChecker.checkHttp(url, options);
            }
            return result.healthy;
        }
        catch (error) {
            this.context.logger.debug(`Health check failed for ${url}:`, error);
            return false;
        }
    }
    /**
     * Helper method to read CloudFormation stack outputs
     */
    async readStackOutputs(stackName) {
        const result = await this.context.stackReader.readStackOutputs(stackName, {
            profile: this.context.globalConfig.aws_profile,
            region: this.context.globalConfig.aws_region,
        });
        if (!result.success) {
            throw new Error(`Failed to read stack outputs for ${stackName}: ${result.error}`);
        }
        return result.outputs;
    }
    /**
     * Helper method to get outputs from a dependency layer
     */
    getDependencyOutputs(dependencyName) {
        return this.context.getLayerOutputs(dependencyName);
    }
    /**
     * Helper method to ensure a repository is cloned and ready
     */
    async ensureRepository(repoUrl, branch) {
        const repoName = this.extractRepoName(repoUrl);
        const localPath = await this.context.gitManager.ensureRepo(repoUrl, branch || this.context.layerConfig.source.branch, repoName);
        // Change to repository directory and verify it's ready
        const originalCwd = this.context.commandExecutor.getCwd();
        try {
            this.context.commandExecutor.setCwd(localPath);
            // If it's a CDK project, ensure dependencies are installed
            if (this.context.layerConfig.source.cdk_path) {
                const cdkPath = this.context.layerConfig.source.cdk_path;
                const fullCdkPath = cdkPath.startsWith('/') ? cdkPath : cdkPath;
                if (this.fileExists(path.join(localPath, fullCdkPath, 'package.json'))) {
                    this.context.logger.info(`Installing CDK dependencies in ${fullCdkPath}`);
                    await this.context.commandExecutor.execute('npm', ['install'], {
                        cwd: path.join(localPath, fullCdkPath),
                        streamOutput: false,
                    });
                }
            }
        }
        finally {
            this.context.commandExecutor.setCwd(originalCwd);
        }
        return localPath;
    }
    /**
     * Helper method to deploy CDK stacks for this layer
     */
    async deployCdkStacks(repoPath, cdkRelativePath, options = {}) {
        const cdkPath = path.join(repoPath, cdkRelativePath);
        this.context.logger.info(`Deploying CDK stacks in ${cdkPath}`);
        const result = await this.context.cdkManager.deploy(cdkPath, {
            profile: this.context.globalConfig.aws_profile,
            region: this.context.globalConfig.aws_region,
            stacks: options.stacks,
            context: options.context,
            requireApproval: 'never',
        });
        if (!result.success) {
            throw new Error(`CDK deployment failed: ${result.error}`);
        }
        return result;
    }
    /**
     * Helper method to execute a script in a repository
     */
    async executeScript(repoPath, scriptPath, options = {}) {
        const fullScriptPath = path.join(repoPath, scriptPath);
        const scriptDir = path.dirname(fullScriptPath);
        const scriptName = path.basename(fullScriptPath);
        this.context.logger.info(`Executing script: ${scriptName} in ${scriptDir}`);
        const result = await this.context.commandExecutor.execute('node', ['-r', 'ts-node/register', scriptName, ...(options.args || [])], {
            cwd: options.cwd || scriptDir,
            env: { ...process.env, ...options.env },
            streamOutput: true,
        });
        if (!result.success) {
            return {
                success: false,
                stdout: result.stdout,
                stderr: result.stderr,
                error: `Script execution failed with exit code ${result.exitCode}`,
            };
        }
        return {
            success: true,
            stdout: result.stdout,
            stderr: result.stderr,
        };
    }
    /**
     * Helper method to write a JSON config file
     */
    async writeConfigFile(filePath, config) {
        const fs = require('fs');
        const dir = path.dirname(filePath);
        // Ensure directory exists
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
        this.context.logger.debug(`Wrote config file: ${filePath}`);
    }
    /**
     * Helper method to check if a file exists
     */
    fileExists(filePath) {
        const fs = require('fs');
        try {
            return fs.existsSync(filePath);
        }
        catch {
            return false;
        }
    }
    /**
     * Extract repository name from URL
     */
    extractRepoName(repoUrl) {
        // Handle different URL formats:
        // https://github.com/user/repo.git -> repo
        // git@github.com:user/repo.git -> repo
        const match = repoUrl.match(/\/([^\/]+?)(\.git)?$/);
        if (match) {
            return match[1];
        }
        // Fallback: use last part of URL
        const parts = repoUrl.split('/');
        return parts[parts.length - 1].replace('.git', '');
    }
    /**
     * Create a standardized LayerOutput
     */
    createLayerOutput(outputs) {
        return {
            layer_name: this.layerName,
            deployed: true,
            outputs,
            timestamp: new Date().toISOString(),
        };
    }
}
exports.BaseLayer = BaseLayer;
//# sourceMappingURL=BaseLayer.js.map