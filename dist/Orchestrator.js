"use strict";
/**
 * Main orchestrator for managing layered NEAR Protocol deployments
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
exports.Orchestrator = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ConfigManager_1 = require("./config/ConfigManager");
const Logger_1 = require("./utils/Logger");
const GitManager_1 = require("./utils/GitManager");
const HealthChecker_1 = require("./utils/HealthChecker");
const CdkManager_1 = require("./aws/CdkManager");
const StackOutputReader_1 = require("./aws/StackOutputReader");
const CommandExecutor_1 = require("./utils/CommandExecutor");
const NearBaseLayer_1 = require("./layers/NearBaseLayer");
const NearServicesLayer_1 = require("./layers/NearServicesLayer");
const ChainSignaturesLayer_1 = require("./layers/ChainSignaturesLayer");
const IntentsProtocolLayer_1 = require("./layers/IntentsProtocolLayer");
const EthereumLocalnetLayer_1 = require("./layers/EthereumLocalnetLayer");
class Orchestrator {
    constructor(options = {}) {
        this.layerOutputs = new Map();
        const { configPath, logLevel = 'info', dryRun = false, awsProfile, awsRegion, } = options;
        // Initialize core utilities
        this.logger = new Logger_1.Logger('Orchestrator', logLevel);
        this.gitManager = new GitManager_1.GitManager(this.getWorkspaceRoot(), this.logger);
        this.commandExecutor = new CommandExecutor_1.CommandExecutor(this.logger);
        this.healthChecker = new HealthChecker_1.HealthChecker(this.logger, this.commandExecutor, 10000, // default timeout
        options.awsProfile, options.awsRegion);
        this.cdkManager = new CdkManager_1.CdkManager(this.logger);
        this.stackReader = new StackOutputReader_1.StackOutputReader(this.logger);
        // Initialize config manager
        this.configManager = new ConfigManager_1.ConfigManager(configPath, this.logger);
        // Initialize deployment state
        this.deploymentState = {
            layers: {},
            timestamp: new Date().toISOString(),
            version: '1.0.0',
        };
        if (dryRun) {
            this.logger.info('🔍 Running in DRY RUN mode - no actual deployments will occur');
        }
    }
    /**
     * Initialize the orchestrator by loading configuration
     */
    async initialize() {
        this.logger.info('🚀 Initializing NEAR Simulators Orchestrator');
        try {
            // Load configuration
            this.config = await this.configManager.get();
            // Load previous deployment state if it exists
            await this.loadDeploymentState();
            this.logger.debug(`Config loaded: ${Object.keys(this.config?.layers || {}).length} layers`);
            this.logger.success('Orchestrator initialized successfully');
        }
        catch (error) {
            this.logger.error('Failed to initialize orchestrator', error);
            throw new Error(`Initialization failed: ${error.message}`);
        }
    }
    /**
     * Run the full orchestration process
     */
    async run(targetLayers) {
        if (!this.config) {
            throw new Error('Orchestrator not initialized. Call initialize() first.');
        }
        const startTime = Date.now();
        this.logger.info('🎯 Starting orchestration process');
        try {
            // Determine which layers to process
            const layersToProcess = targetLayers || this.getEnabledLayers();
            // Resolve dependencies and get execution order
            const executionOrder = this.resolveDependencies(layersToProcess);
            this.logger.info(`📋 Execution plan: ${executionOrder.join(' → ')}`);
            // Process each layer
            for (const layerName of executionOrder) {
                const success = await this.processLayer(layerName);
                if (!success) {
                    if (!this.config.global.continue_on_error) {
                        this.logger.error(`❌ Layer '${layerName}' failed. Stopping execution.`);
                        await this.rollbackFailedLayers(executionOrder, layerName);
                        return { success: false, error: `Layer '${layerName}' deployment failed` };
                    }
                    else {
                        this.logger.warn(`⚠️  Layer '${layerName}' failed but continuing due to continueOnError setting`);
                    }
                }
            }
            // Save final deployment state
            await this.saveDeploymentState();
            const duration = Date.now() - startTime;
            this.logger.success(`✅ Orchestration completed successfully in ${duration}ms`);
            return { success: true };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.logger.failOperation('Orchestration process', error);
            // Attempt rollback on critical errors
            await this.rollbackAllLayers();
            return { success: false, error: error.message };
        }
    }
    /**
     * Verify all layers without deploying
     */
    async verify(targetLayers) {
        if (!this.config) {
            throw new Error('Orchestrator not initialized. Call initialize() first.');
        }
        this.logger.info('🔍 Verifying layers');
        const layersToCheck = (targetLayers && targetLayers.length > 0) ? targetLayers : this.getEnabledLayers();
        this.logger.debug(`Layers to check: ${layersToCheck.join(', ')}`);
        const results = {};
        for (const layerName of layersToCheck) {
            const layer = this.createLayerInstance(layerName);
            try {
                const result = await layer.verify();
                results[layerName] = result;
                if (result.skip) {
                    this.logger.layerVerify(layerName, result);
                }
                else {
                    this.logger.info(`🔍 Layer '${layerName}' requires deployment`);
                }
            }
            catch (error) {
                this.logger.error(`Verification failed for layer '${layerName}'`, error);
                results[layerName] = { skip: false };
            }
        }
        const allHealthy = Object.values(results).every(result => result.skip);
        if (allHealthy) {
            this.logger.success('✅ All layers are healthy - no deployment needed');
        }
        return { success: true, results };
    }
    /**
     * Destroy all deployed layers in reverse order
     */
    async destroy(targetLayers) {
        if (!this.config) {
            throw new Error('Orchestrator not initialized. Call initialize() first.');
        }
        this.logger.info('🗑️  Starting destruction process');
        try {
            // Get layers to destroy (reverse dependency order)
            const layersToDestroy = targetLayers || this.getEnabledLayers().reverse();
            for (const layerName of layersToDestroy) {
                const success = await this.destroyLayer(layerName);
                if (!success) {
                    this.logger.warn(`⚠️  Failed to destroy layer '${layerName}'`);
                    // Continue with other layers
                }
            }
            // Clean up deployment state
            await this.cleanupDeploymentState();
            this.logger.success('🗑️  Destruction completed');
            return { success: true };
        }
        catch (error) {
            this.logger.failOperation('Destruction process', error);
            return { success: false, error: error.message };
        }
    }
    /**
     * Get current deployment status
     */
    getStatus() {
        return {
            layers: Object.fromEntries(this.layerOutputs),
            timestamp: this.deploymentState.timestamp,
        };
    }
    /**
     * Process a single layer (verify -> deploy -> get outputs)
     */
    async processLayer(layerName) {
        const layer = this.createLayerInstance(layerName);
        try {
            // Step 1: Verify
            this.logger.info(`🔍 Verifying layer '${layerName}'...`);
            const verifyResult = await layer.verify();
            if (verifyResult.skip) {
                this.logger.layerVerify(layerName, verifyResult);
                if (verifyResult.existingOutput) {
                    this.layerOutputs.set(layerName, verifyResult.existingOutput);
                }
                return true;
            }
            // Step 2: Deploy
            this.logger.layerDeploy(layerName);
            const deployResult = await layer.deploy();
            if (!deployResult.success) {
                this.logger.error(`Deployment failed for layer '${layerName}': ${deployResult.error}`);
                return false;
            }
            // Step 3: Get outputs
            this.logger.info(`📤 Getting outputs for layer '${layerName}'...`);
            const outputs = await layer.getOutputs();
            this.layerOutputs.set(layerName, outputs);
            this.logger.layerDeployed(layerName);
            return true;
        }
        catch (error) {
            this.logger.error(`Layer '${layerName}' processing failed`, error);
            return false;
        }
    }
    /**
     * Destroy a single layer
     */
    async destroyLayer(layerName) {
        try {
            const layer = this.createLayerInstance(layerName);
            const result = await layer.destroy();
            if (result.success) {
                this.logger.layerDestroyed(layerName);
                this.layerOutputs.delete(layerName);
                return true;
            }
            else {
                this.logger.error(`Failed to destroy layer '${layerName}': ${result.error}`);
                return false;
            }
        }
        catch (error) {
            this.logger.error(`Destroy failed for layer '${layerName}'`, error);
            return false;
        }
    }
    /**
     * Create a layer instance with proper context
     */
    createLayerInstance(layerName) {
        if (!this.config) {
            throw new Error('Configuration not loaded');
        }
        const layerConfig = this.config.layers[layerName];
        if (!layerConfig) {
            throw new Error(`Layer '${layerName}' not found in configuration`);
        }
        const context = {
            globalConfig: this.config.global,
            layerConfig,
            configManager: this.configManager,
            logger: this.logger.child(layerName),
            gitManager: this.gitManager,
            healthChecker: this.healthChecker,
            cdkManager: this.cdkManager,
            stackReader: this.stackReader,
            commandExecutor: this.commandExecutor,
            getLayerOutputs: (name) => this.layerOutputs.get(name),
        };
        switch (layerName) {
            case 'ethereum_localnet':
                return new EthereumLocalnetLayer_1.EthereumLocalnetLayer(layerName, context);
            case 'near_base':
                return new NearBaseLayer_1.NearBaseLayer(layerName, context);
            case 'near_services':
                return new NearServicesLayer_1.NearServicesLayer(layerName, context);
            case 'chain_signatures':
                return new ChainSignaturesLayer_1.ChainSignaturesLayer(layerName, context);
            case 'intents_protocol':
                return new IntentsProtocolLayer_1.IntentsProtocolLayer(layerName, context);
            default:
                throw new Error(`Unknown layer type: ${layerName}. Valid layers: ethereum_localnet, near_base, near_services, chain_signatures, intents_protocol`);
        }
    }
    /**
     * Resolve dependencies and return execution order
     */
    resolveDependencies(targetLayers) {
        if (!this.config) {
            throw new Error('Configuration not loaded');
        }
        const enabledLayers = new Set(this.getEnabledLayers());
        const layersToProcess = targetLayers.filter(layer => enabledLayers.has(layer));
        // Build dependency graph
        const dependencyGraph = new Map();
        for (const layerName of this.configManager.getEnabledLayers()) {
            const layerConfig = this.config.layers[layerName];
            const deps = layerConfig.depends_on || [];
            dependencyGraph.set(layerName, deps);
        }
        // Recursively collect all dependencies for target layers
        const allRequiredLayers = new Set();
        const collectDependencies = (layerName) => {
            if (allRequiredLayers.has(layerName))
                return;
            allRequiredLayers.add(layerName);
            const deps = dependencyGraph.get(layerName) || [];
            for (const dep of deps) {
                collectDependencies(dep);
            }
        };
        // Collect dependencies for all target layers
        for (const layerName of layersToProcess) {
            collectDependencies(layerName);
        }
        // Return in dependency order (dependencies first)
        return this.configManager.getEnabledLayers().filter(layer => allRequiredLayers.has(layer));
    }
    /**
     * Get all enabled layers
     */
    getEnabledLayers() {
        return this.configManager.getEnabledLayers();
    }
    /**
     * Rollback layers that were successfully deployed before the failure
     */
    async rollbackFailedLayers(executionOrder, failedLayer) {
        const failedIndex = executionOrder.indexOf(failedLayer);
        if (failedIndex === -1)
            return;
        const layersToRollback = executionOrder.slice(0, failedIndex).reverse();
        if (layersToRollback.length === 0)
            return;
        this.logger.warn(`🔄 Rolling back ${layersToRollback.length} successfully deployed layers...`);
        for (const layerName of layersToRollback) {
            const success = await this.destroyLayer(layerName);
            if (success) {
                this.logger.info(`✅ Rolled back layer '${layerName}'`);
            }
            else {
                this.logger.error(`❌ Failed to rollback layer '${layerName}'`);
            }
        }
    }
    /**
     * Rollback all layers on critical failure
     */
    async rollbackAllLayers() {
        this.logger.warn('🔄 Attempting full rollback due to critical failure...');
        const enabledLayers = this.getEnabledLayers().reverse();
        for (const layerName of enabledLayers) {
            await this.destroyLayer(layerName);
        }
    }
    /**
     * Load previous deployment state
     */
    async loadDeploymentState() {
        try {
            const statePath = path.join(process.cwd(), 'deployment-state.json');
            if (fs.existsSync(statePath)) {
                const stateContent = fs.readFileSync(statePath, 'utf-8');
                const savedState = JSON.parse(stateContent);
                // Restore layer outputs
                this.layerOutputs = new Map(Object.entries(savedState.layers));
                this.deploymentState = savedState;
                this.logger.debug(`Loaded previous deployment state from ${savedState.timestamp}`);
            }
        }
        catch (error) {
            this.logger.warn('Failed to load previous deployment state', error);
        }
    }
    /**
     * Save current deployment state
     */
    async saveDeploymentState() {
        try {
            this.deploymentState.layers = Object.fromEntries(this.layerOutputs);
            this.deploymentState.timestamp = new Date().toISOString();
            const statePath = path.join(process.cwd(), 'deployment-state.json');
            fs.writeFileSync(statePath, JSON.stringify(this.deploymentState, null, 2));
            this.logger.debug('Deployment state saved');
        }
        catch (error) {
            this.logger.warn('Failed to save deployment state', error);
        }
    }
    /**
     * Clean up deployment state file
     */
    async cleanupDeploymentState() {
        try {
            const statePath = path.join(process.cwd(), 'deployment-state.json');
            if (fs.existsSync(statePath)) {
                fs.unlinkSync(statePath);
                this.logger.debug('Deployment state file cleaned up');
            }
            this.layerOutputs.clear();
        }
        catch (error) {
            this.logger.warn('Failed to cleanup deployment state', error);
        }
    }
    /**
     * Get workspace root path
     */
    getWorkspaceRoot() {
        return this.config?.global.workspace_root || path.join(process.cwd(), 'workspace');
    }
}
exports.Orchestrator = Orchestrator;
//# sourceMappingURL=Orchestrator.js.map