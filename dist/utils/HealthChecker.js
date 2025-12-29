"use strict";
/**
 * Health checking utilities for various services
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthChecker = void 0;
const axios_1 = __importDefault(require("axios"));
const Logger_1 = require("./Logger");
const CommandExecutor_1 = require("./CommandExecutor");
class HealthChecker {
    constructor(logger, commandExecutor, defaultTimeout = 10000, awsProfile, awsRegion) {
        this.logger = logger || new Logger_1.Logger('HealthChecker');
        this.commandExecutor = commandExecutor || new CommandExecutor_1.CommandExecutor(this.logger);
        this.defaultTimeout = defaultTimeout;
        this.awsProfile = awsProfile;
        this.awsRegion = awsRegion;
    }
    /**
     * Check NEAR RPC endpoint health with thorough verification
     */
    async checkRpc(url, expectedNetworkId, timeout) {
        const baseUrl = url.endsWith('/status') ? url.replace('/status', '') : url;
        const statusUrl = `${baseUrl}/status`;
        const startTime = Date.now();
        try {
            this.logger.debug(`Performing thorough NEAR RPC health check: ${baseUrl}`);
            // Step 1: Basic status check
            const statusResponse = await axios_1.default.get(statusUrl, {
                timeout: timeout || this.defaultTimeout,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            if (!statusResponse.data || !statusResponse.data.sync_info) {
                return {
                    healthy: false,
                    response_time: Date.now() - startTime,
                    error: 'Invalid status response structure',
                };
            }
            const status = statusResponse.data;
            // Step 2: Verify network ID if expected
            if (expectedNetworkId && status.chain_id !== expectedNetworkId) {
                return {
                    healthy: false,
                    response_time: Date.now() - startTime,
                    error: `Network ID mismatch: expected ${expectedNetworkId}, got ${status.chain_id}`,
                };
            }
            // Step 3: Check if node is producing blocks (not just syncing)
            if (status.sync_info.syncing) {
                this.logger.warn(`NEAR node is still syncing at height ${status.sync_info.latest_block_height}`);
            }
            // Step 4: Test actual RPC functionality with a block query
            const blockResult = await this.testRpcFunctionality(baseUrl, timeout || this.defaultTimeout);
            if (!blockResult.healthy) {
                return {
                    healthy: false,
                    response_time: Date.now() - startTime,
                    error: `RPC functionality test failed: ${blockResult.error}`,
                };
            }
            // Step 5: Test validator info if available
            const validatorResult = await this.testValidatorInfo(baseUrl, timeout || this.defaultTimeout);
            if (!validatorResult.healthy) {
                this.logger.warn(`Validator info check failed: ${validatorResult.error}`);
                // Don't fail the entire check for this, just log it
            }
            const responseTime = Date.now() - startTime;
            this.logger.healthCheck(baseUrl, true, responseTime);
            return {
                healthy: true,
                response_time: responseTime,
            };
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            const errorMessage = error.message || 'Unknown error';
            this.logger.healthCheck(baseUrl, false, responseTime);
            this.logger.debug(`NEAR RPC health check failed: ${errorMessage}`);
            return {
                healthy: false,
                response_time: responseTime,
                error: errorMessage,
            };
        }
    }
    /**
     * Test actual RPC functionality by making a block query
     */
    async testRpcFunctionality(baseUrl, timeout) {
        try {
            const response = await axios_1.default.post(`${baseUrl}`, {
                jsonrpc: '2.0',
                id: 'health-check',
                method: 'block',
                params: {
                    block_id: null, // Latest block
                },
            }, {
                timeout,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            if (response.data && response.data.result && response.data.result.header) {
                return { healthy: true };
            }
            else {
                return {
                    healthy: false,
                    error: 'Invalid block response structure',
                };
            }
        }
        catch (error) {
            return {
                healthy: false,
                error: `Block query failed: ${error.message}`,
            };
        }
    }
    /**
     * Test validator information
     */
    async testValidatorInfo(baseUrl, timeout) {
        try {
            const response = await axios_1.default.post(`${baseUrl}`, {
                jsonrpc: '2.0',
                id: 'validator-check',
                method: 'validators',
                params: {
                    block_id: null,
                },
            }, {
                timeout,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            if (response.data && response.data.result) {
                return { healthy: true };
            }
            else {
                return {
                    healthy: false,
                    error: 'Invalid validator response structure',
                };
            }
        }
        catch (error) {
            return {
                healthy: false,
                error: `Validator query failed: ${error.message}`,
            };
        }
    }
    /**
     * Check HTTP endpoint health with custom validation
     */
    async checkHttp(url, options = {}) {
        const { timeout = this.defaultTimeout, expectedStatus = 200, validator, } = options;
        const startTime = Date.now();
        try {
            this.logger.debug(`Checking HTTP health: ${url}`);
            const response = await axios_1.default.get(url, {
                timeout,
                validateStatus: () => true, // Don't throw on non-2xx
            });
            const responseTime = Date.now() - startTime;
            // Check status code
            if (response.status !== expectedStatus) {
                return {
                    healthy: false,
                    response_time: responseTime,
                    error: `Unexpected status code: ${response.status} (expected ${expectedStatus})`,
                };
            }
            // Run custom validator if provided
            if (validator && !validator(response)) {
                return {
                    healthy: false,
                    response_time: responseTime,
                    error: 'Custom validation failed',
                };
            }
            this.logger.healthCheck(url, true, responseTime);
            return {
                healthy: true,
                response_time: responseTime,
            };
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            const errorMessage = error.message || 'Unknown error';
            this.logger.healthCheck(url, false, responseTime);
            return {
                healthy: false,
                response_time: responseTime,
                error: errorMessage,
            };
        }
    }
    /**
     * Check MPC node health with thorough verification
     */
    async checkMpcNode(nodeUrl, nearRpcUrl, expectedContractId, timeout, instanceId // For SSM fallback
    ) {
        const startTime = Date.now();
        try {
            this.logger.debug(`Performing thorough MPC node health check: ${nodeUrl}`);
            // Step 1: Try external HTTP connectivity first
            const httpResult = await this.checkHttp(nodeUrl, { timeout: timeout || this.defaultTimeout });
            if (httpResult.healthy) {
                this.logger.debug(`External access to MPC node successful`);
                return this.performFullMpcChecks(nodeUrl, nearRpcUrl, expectedContractId, timeout);
            }
            // Step 2: If external access fails and we have instance ID, try SSM
            if (!httpResult.healthy && instanceId && this.awsProfile) {
                this.logger.debug(`External access failed, trying SSM health check for instance ${instanceId}`);
                return this.checkMpcNodeViaSSM(instanceId, nearRpcUrl, expectedContractId, timeout);
            }
            // Step 3: If no instance ID or AWS config, report external access failure
            const errorMsg = instanceId
                ? `Cannot access MPC node externally and SSM not configured (missing AWS profile)`
                : `Cannot access MPC node externally and no instance ID provided for SSM fallback`;
            return {
                healthy: false,
                response_time: Date.now() - startTime,
                error: `${errorMsg}: ${httpResult.error}`,
            };
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            const errorMessage = error.message || 'Unknown error';
            this.logger.healthCheck(nodeUrl, false, responseTime);
            this.logger.debug(`MPC node health check failed: ${errorMessage}`);
            return {
                healthy: false,
                response_time: responseTime,
                error: errorMessage,
            };
        }
    }
    /**
     * Perform full MPC health checks when external access works
     */
    async performFullMpcChecks(nodeUrl, nearRpcUrl, expectedContractId, timeout) {
        const startTime = Date.now();
        // Step 1: Check health endpoint
        const healthEndpoint = `${nodeUrl}/health`;
        const healthResult = await this.checkHttp(healthEndpoint, {
            timeout: timeout || this.defaultTimeout,
            expectedStatus: 200,
        });
        if (healthResult.healthy) {
            this.logger.debug(`MPC node health endpoint available: ${healthEndpoint}`);
        }
        // Step 2: Test MPC-NEAR communication
        if (nearRpcUrl) {
            const nearCommResult = await this.testMpcNearCommunication(nodeUrl, nearRpcUrl, timeout || this.defaultTimeout);
            if (!nearCommResult.healthy) {
                return {
                    healthy: false,
                    response_time: Date.now() - startTime,
                    error: `MPC-NEAR communication failed: ${nearCommResult.error}`,
                };
            }
        }
        // Step 3: Check contract interaction
        if (expectedContractId && nearRpcUrl) {
            const contractResult = await this.testMpcContractInteraction(nearRpcUrl, expectedContractId, timeout || this.defaultTimeout);
            if (!contractResult.healthy) {
                this.logger.warn(`MPC contract interaction check failed: ${contractResult.error}`);
            }
        }
        return {
            healthy: true,
            response_time: Date.now() - startTime,
        };
    }
    /**
     * Check MPC node health via AWS SSM when external access fails
     */
    async checkMpcNodeViaSSM(instanceId, nearRpcUrl, expectedContractId, timeout) {
        const startTime = Date.now();
        try {
            this.logger.debug(`Checking MPC node health via SSM for instance: ${instanceId}`);
            // Use a single simple command to avoid AWS CLI parsing issues
            // Download and run the health check script from S3
            const s3ScriptUrl = 'https://near-dev-scripts-shai-20250717.s3.amazonaws.com/mpc-health-check.sh';
            const fullCommand = `curl -s ${s3ScriptUrl} | bash`;
            // Execute SSM command
            const profileArg = this.awsProfile ? ['--profile', this.awsProfile] : [];
            const regionArg = this.awsRegion ? ['--region', this.awsRegion] : [];
            const ssmArgs = [
                'ssm', 'send-command',
                '--instance-ids', instanceId,
                '--document-name', 'AWS-RunShellScript',
                '--parameters', `commands=["${fullCommand}"]`,
                ...profileArg,
                ...regionArg,
                '--output', 'text',
                '--query', 'Command.CommandId'
            ];
            const ssmResult = await this.commandExecutor.execute('aws', ssmArgs, { silent: true });
            if (!ssmResult.success) {
                return {
                    healthy: false,
                    response_time: Date.now() - startTime,
                    error: `SSM command failed: ${ssmResult.stderr}`,
                };
            }
            const commandId = ssmResult.stdout.trim();
            this.logger.debug(`SSM command sent, ID: ${commandId}`);
            // Wait a bit for command to execute
            await this.sleep(3000);
            // Get command invocation results
            const outputArgs = [
                'ssm', 'get-command-invocation',
                '--command-id', commandId,
                '--instance-id', instanceId,
                ...profileArg,
                ...regionArg,
                '--output', 'text',
                '--query', 'StandardOutputContent'
            ];
            const outputResult = await this.commandExecutor.execute('aws', outputArgs, { silent: true });
            if (!outputResult.success) {
                return {
                    healthy: false,
                    response_time: Date.now() - startTime,
                    error: `Failed to get SSM command output: ${outputResult.stderr}`,
                };
            }
            // Parse the comprehensive health check script output
            const output = outputResult.stdout.trim();
            // Look for key indicators in the output
            const hasMpcProcesses = output.includes('MPC processes running:') &&
                !output.includes('MPC processes running: 0');
            const nearConnectionOk = output.includes('NEAR RPC connection: SUCCESS');
            const portsListening = output.includes('listeners') &&
                !output.includes('Port 3030 (NEAR RPC): 0 listeners');
            const appearsHealthy = output.includes('MPC Node appears HEALTHY');
            // Calculate health score based on multiple factors
            const checks = [hasMpcProcesses, nearConnectionOk, portsListening, appearsHealthy];
            const healthScore = checks.filter(Boolean).length;
            const totalChecks = checks.length;
            const isHealthy = appearsHealthy || healthScore >= Math.ceil(totalChecks * 0.6); // 60% pass rate
            const details = `processes=${hasMpcProcesses ? 'YES' : 'NO'}, near=${nearConnectionOk ? 'OK' : 'FAIL'}, ports=${portsListening ? 'YES' : 'NO'}, script=${appearsHealthy ? 'HEALTHY' : 'ISSUES'}`;
            if (isHealthy) {
                this.logger.success(`MPC node ${instanceId} healthy via SSM (${healthScore}/${totalChecks}): ${details}`);
                return {
                    healthy: true,
                    response_time: Date.now() - startTime,
                };
            }
            else {
                this.logger.warn(`MPC node ${instanceId} health issues via SSM (${healthScore}/${totalChecks}): ${details}`);
                return {
                    healthy: false,
                    response_time: Date.now() - startTime,
                    error: `Health check failed (${healthScore}/${totalChecks}): ${details}`,
                };
            }
        }
        catch (error) {
            return {
                healthy: false,
                response_time: Date.now() - startTime,
                error: `SSM health check error: ${error.message}`,
            };
        }
    }
    /**
     * Test MPC node's communication with NEAR network
     */
    async testMpcNearCommunication(mpcNodeUrl, nearRpcUrl, timeout) {
        try {
            // This would ideally test if the MPC node can query the NEAR network
            // For now, we'll test if the MPC node can reach the NEAR RPC
            // In a real implementation, this might involve checking MPC-specific endpoints
            const nearHealth = await this.checkRpc(nearRpcUrl, undefined, timeout);
            if (!nearHealth.healthy) {
                return {
                    healthy: false,
                    error: 'NEAR RPC is not accessible for MPC communication',
                };
            }
            // Additional MPC-specific checks could go here
            // For example, checking if MPC node has the right keys or can participate in MPC operations
            return { healthy: true };
        }
        catch (error) {
            return {
                healthy: false,
                error: `MPC-NEAR communication test failed: ${error.message}`,
            };
        }
    }
    /**
     * Test MPC contract interaction
     */
    async testMpcContractInteraction(nearRpcUrl, contractId, timeout) {
        try {
            // Query contract state to verify it exists and is accessible
            const response = await axios_1.default.post(`${nearRpcUrl}`, {
                jsonrpc: '2.0',
                id: 'contract-check',
                method: 'query',
                params: {
                    request_type: 'view_state',
                    account_id: contractId,
                    prefix_base64: '', // Empty prefix to get all state
                    finality: 'final',
                },
            }, {
                timeout,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            if (response.data && response.data.result) {
                return { healthy: true };
            }
            else {
                return {
                    healthy: false,
                    error: 'Contract state query failed or contract does not exist',
                };
            }
        }
        catch (error) {
            return {
                healthy: false,
                error: `Contract interaction test failed: ${error.message}`,
            };
        }
    }
    /**
     * Check multiple endpoints and return aggregate health
     */
    async checkMultiple(endpoints) {
        const results = [];
        let overallHealthy = true;
        for (const endpoint of endpoints) {
            let result;
            if (endpoint.type === 'rpc') {
                result = await this.checkRpc(endpoint.url);
            }
            else {
                result = await this.checkHttp(endpoint.url, endpoint.options);
            }
            results.push({ url: endpoint.url, result });
            if (!result.healthy) {
                overallHealthy = false;
            }
        }
        return {
            overall: overallHealthy,
            results,
        };
    }
    /**
     * Wait for an endpoint to become healthy with retries
     */
    async waitForHealthy(url, type = 'http', options = {}) {
        const { maxRetries = 30, retryInterval = 5000, // 5 seconds
        timeout = this.defaultTimeout, } = options;
        this.logger.info(`Waiting for ${url} to become healthy (max ${maxRetries} retries)`);
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            this.logger.debug(`Health check attempt ${attempt}/${maxRetries} for ${url}`);
            let result;
            if (type === 'rpc') {
                result = await this.checkRpc(url, undefined, timeout);
            }
            else {
                result = await this.checkHttp(url, { timeout });
            }
            if (result.healthy) {
                this.logger.success(`Endpoint became healthy after ${attempt} attempts: ${url}`);
                return result;
            }
            if (attempt < maxRetries) {
                this.logger.debug(`Endpoint not healthy, waiting ${retryInterval}ms before retry...`);
                await this.sleep(retryInterval);
            }
        }
        const finalResult = {
            healthy: false,
            error: `Endpoint did not become healthy after ${maxRetries} attempts`,
        };
        this.logger.error(`Health check failed for ${url}: ${finalResult.error}`);
        return finalResult;
    }
    /**
     * Check if a TCP port is open
     */
    async checkTcp(host, port, timeout = 5000) {
        const startTime = Date.now();
        const url = `${host}:${port}`;
        return new Promise((resolve) => {
            const net = require('net');
            const client = net.createConnection({ host, port }, () => {
                const responseTime = Date.now() - startTime;
                client.end();
                this.logger.healthCheck(url, true, responseTime);
                resolve({
                    healthy: true,
                    response_time: responseTime,
                });
            });
            client.setTimeout(timeout);
            client.on('error', (error) => {
                const responseTime = Date.now() - startTime;
                this.logger.healthCheck(url, false, responseTime);
                resolve({
                    healthy: false,
                    response_time: responseTime,
                    error: error.message,
                });
            });
            client.on('timeout', () => {
                const responseTime = Date.now() - startTime;
                client.end();
                this.logger.healthCheck(url, false, responseTime);
                resolve({
                    healthy: false,
                    response_time: responseTime,
                    error: 'Connection timeout',
                });
            });
        });
    }
    /**
     * Utility method to sleep for a given number of milliseconds
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.HealthChecker = HealthChecker;
//# sourceMappingURL=HealthChecker.js.map