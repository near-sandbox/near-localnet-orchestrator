"use strict";
/**
 * AWS CDK deployment manager
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
exports.CdkManager = void 0;
const path = __importStar(require("path"));
const Logger_1 = require("../utils/Logger");
const CommandExecutor_1 = require("../utils/CommandExecutor");
class CdkManager {
    constructor(logger) {
        this.logger = logger || new Logger_1.Logger('CdkManager');
        this.executor = new CommandExecutor_1.CommandExecutor(this.logger);
    }
    /**
     * Deploy CDK stacks
     */
    async deploy(cdkPath, options = {}) {
        const startTime = Date.now();
        const { profile, region, stacks = [], context = {}, timeout = 1800000, // 30 minutes default
        requireApproval = 'never', } = options;
        this.logger.startOperation(`CDK deploy in ${cdkPath}`);
        try {
            // Change to CDK directory
            const originalCwd = this.executor.getCwd();
            this.executor.setCwd(cdkPath);
            // Build the CDK deploy command
            const args = ['deploy'];
            // Add profile if specified
            if (profile) {
                args.push('--profile', profile);
            }
            // Add region if specified
            if (region) {
                args.push('--region', region);
            }
            // Add stacks if specified
            if (stacks.length > 0) {
                args.push(...stacks);
            }
            // Add context variables
            for (const [key, value] of Object.entries(context)) {
                args.push('--context', `${key}=${value}`);
            }
            // Add approval setting
            args.push('--require-approval', requireApproval);
            // Add other common flags
            args.push('--outputs-file', 'cdk-outputs.json');
            this.logger.info(`Running: cdk ${args.join(' ')}`);
            // Execute CDK deploy
            const result = await this.executor.execute('npx', ['cdk', ...args], {
                cwd: cdkPath,
                timeout,
                streamOutput: true,
            });
            const duration = Date.now() - startTime;
            if (result.success) {
                this.logger.completeOperation(`CDK deploy in ${cdkPath}`, duration);
                // Try to read outputs file
                let outputs;
                try {
                    const outputsPath = path.join(cdkPath, 'cdk-outputs.json');
                    const fs = require('fs');
                    if (fs.existsSync(outputsPath)) {
                        const outputsContent = fs.readFileSync(outputsPath, 'utf-8');
                        outputs = JSON.parse(outputsContent);
                    }
                }
                catch (error) {
                    this.logger.warn('Failed to read CDK outputs file', error);
                }
                return {
                    success: true,
                    deployedStacks: stacks.length > 0 ? stacks : ['all'],
                    outputs,
                    duration,
                };
            }
            else {
                this.logger.failOperation(`CDK deploy in ${cdkPath}`, result.stderr);
                return {
                    success: false,
                    deployedStacks: [],
                    error: result.stderr,
                    duration,
                };
            }
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.logger.failOperation(`CDK deploy in ${cdkPath}`, error);
            return {
                success: false,
                deployedStacks: [],
                error: error.message,
                duration,
            };
        }
    }
    /**
     * Destroy CDK stacks
     */
    async destroy(cdkPath, options = {}) {
        const startTime = Date.now();
        const { profile, region, stacks = [], force = false, } = options;
        this.logger.startOperation(`CDK destroy in ${cdkPath}`);
        try {
            // Change to CDK directory
            const originalCwd = this.executor.getCwd();
            this.executor.setCwd(cdkPath);
            // Build the CDK destroy command
            const args = ['destroy'];
            // Add profile if specified
            if (profile) {
                args.push('--profile', profile);
            }
            // Add region if specified
            if (region) {
                args.push('--region', region);
            }
            // Add stacks if specified
            if (stacks.length > 0) {
                args.push(...stacks);
            }
            // Add force flag if specified
            if (force) {
                args.push('--force');
            }
            // Add approval setting (always never for destroy)
            args.push('--require-approval', 'never');
            this.logger.info(`Running: cdk ${args.join(' ')}`);
            // Execute CDK destroy
            const result = await this.executor.execute('npx', ['cdk', ...args], {
                cwd: cdkPath,
                streamOutput: true,
            });
            const duration = Date.now() - startTime;
            if (result.success) {
                this.logger.completeOperation(`CDK destroy in ${cdkPath}`, duration);
                return {
                    success: true,
                    destroyedStacks: stacks.length > 0 ? stacks : ['all'],
                    duration,
                };
            }
            else {
                this.logger.failOperation(`CDK destroy in ${cdkPath}`, result.stderr);
                return {
                    success: false,
                    destroyedStacks: [],
                    error: result.stderr,
                    duration,
                };
            }
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.logger.failOperation(`CDK destroy in ${cdkPath}`, error);
            return {
                success: false,
                destroyedStacks: [],
                error: error.message,
                duration,
            };
        }
    }
    /**
     * Synthesize CDK stacks (validate CloudFormation templates)
     */
    async synth(cdkPath, options = {}) {
        const startTime = Date.now();
        const { profile, region, stacks = [], context = {}, } = options;
        this.logger.debug(`Synthesizing CDK stacks in ${cdkPath}`);
        try {
            // Change to CDK directory
            const originalCwd = this.executor.getCwd();
            this.executor.setCwd(cdkPath);
            // Build the CDK synth command
            const args = ['synth'];
            // Add profile if specified
            if (profile) {
                args.push('--profile', profile);
            }
            // Add region if specified
            if (region) {
                args.push('--region', region);
            }
            // Add stacks if specified
            if (stacks.length > 0) {
                args.push(...stacks);
            }
            // Add context variables
            for (const [key, value] of Object.entries(context)) {
                args.push('--context', `${key}=${value}`);
            }
            // Execute CDK synth
            const result = await this.executor.execute('npx', ['cdk', ...args], {
                cwd: cdkPath,
                timeout: 300000, // 5 minutes
                streamOutput: false, // Synth output can be verbose
            });
            const duration = Date.now() - startTime;
            if (result.success) {
                this.logger.debug(`CDK synthesis completed successfully (${duration}ms)`);
                return { success: true, duration };
            }
            else {
                this.logger.error(`CDK synthesis failed: ${result.stderr}`);
                return { success: false, error: result.stderr, duration };
            }
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.logger.error('CDK synthesis failed', error);
            return { success: false, error: error.message, duration };
        }
    }
    /**
     * Bootstrap CDK environment if needed
     */
    async bootstrap(cdkPath, options = {}) {
        const startTime = Date.now();
        const { profile, region, account } = options;
        this.logger.debug(`Bootstrapping CDK environment in ${cdkPath}`);
        try {
            // Change to CDK directory
            const originalCwd = this.executor.getCwd();
            this.executor.setCwd(cdkPath);
            // Build the CDK bootstrap command
            const args = ['bootstrap'];
            // Add profile if specified
            if (profile) {
                args.push('--profile', profile);
            }
            // Add account/region if specified
            if (account && region) {
                args.push(`${account}/${region}`);
            }
            // Execute CDK bootstrap
            const result = await this.executor.execute('npx', ['cdk', ...args], {
                cwd: cdkPath,
                timeout: 600000, // 10 minutes
                streamOutput: true,
            });
            const duration = Date.now() - startTime;
            if (result.success) {
                this.logger.debug(`CDK bootstrap completed successfully (${duration}ms)`);
                return { success: true, duration };
            }
            else {
                this.logger.error(`CDK bootstrap failed: ${result.stderr}`);
                return { success: false, error: result.stderr, duration };
            }
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.logger.error('CDK bootstrap failed', error);
            return { success: false, error: error.message, duration };
        }
    }
}
exports.CdkManager = CdkManager;
//# sourceMappingURL=CdkManager.js.map