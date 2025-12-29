"use strict";
/**
 * AWS CloudFormation stack output reader
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StackOutputReader = void 0;
const Logger_1 = require("../utils/Logger");
const CommandExecutor_1 = require("../utils/CommandExecutor");
class StackOutputReader {
    constructor(logger) {
        this.logger = logger || new Logger_1.Logger('StackOutputReader');
        this.executor = new CommandExecutor_1.CommandExecutor(this.logger);
    }
    /**
     * Read outputs from a CloudFormation stack
     */
    async readStackOutputs(stackName, options = {}) {
        const { profile, region, maxRetries = 3 } = options;
        this.logger.debug(`Reading outputs from stack: ${stackName}`);
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await this.readStackOutputsOnce(stackName, { profile, region });
                if (result.success) {
                    return result;
                }
                if (attempt < maxRetries) {
                    this.logger.debug(`Attempt ${attempt} failed, retrying in 2 seconds...`);
                    await this.sleep(2000);
                }
                else {
                    this.logger.warn(`All ${maxRetries} attempts failed for stack ${stackName}`);
                }
            }
            catch (error) {
                this.logger.warn(`Attempt ${attempt} failed with error: ${error.message}`);
                if (attempt === maxRetries) {
                    return {
                        success: false,
                        outputs: {},
                        error: error.message,
                    };
                }
                await this.sleep(2000);
            }
        }
        return {
            success: false,
            outputs: {},
            error: `Failed to read stack outputs after ${maxRetries} attempts`,
        };
    }
    /**
     * Read outputs from a single stack
     */
    async readStackOutputsOnce(stackName, options) {
        const { profile, region } = options;
        // Build AWS CLI command
        const args = ['cloudformation', 'describe-stacks', '--stack-name', stackName];
        if (profile) {
            args.push('--profile', profile);
        }
        if (region) {
            args.push('--region', region);
        }
        // Execute AWS CLI command
        const result = await this.executor.execute('aws', args, { silent: true });
        if (!result.success) {
            throw new Error(`AWS CLI command failed: ${result.stderr}`);
        }
        try {
            const response = JSON.parse(result.stdout);
            if (!response.Stacks || response.Stacks.length === 0) {
                throw new Error(`Stack '${stackName}' not found`);
            }
            const stack = response.Stacks[0];
            if (!stack.Outputs || stack.Outputs.length === 0) {
                this.logger.debug(`Stack '${stackName}' has no outputs`);
                return {
                    success: true,
                    outputs: {},
                };
            }
            // Convert outputs array to key-value pairs
            const outputs = {};
            for (const output of stack.Outputs) {
                outputs[output.OutputKey] = output.OutputValue;
            }
            this.logger.debug(`Read ${Object.keys(outputs).length} outputs from stack '${stackName}'`);
            return {
                success: true,
                outputs,
            };
        }
        catch (error) {
            if (error instanceof SyntaxError) {
                throw new Error(`Invalid JSON response from AWS CLI: ${result.stdout}`);
            }
            throw error;
        }
    }
    /**
     * Read outputs from multiple stacks
     */
    async readMultipleStackOutputs(stackNames, options = {}) {
        const results = {};
        this.logger.info(`Reading outputs from ${stackNames.length} stacks`);
        // Read stacks in parallel for better performance
        const promises = stackNames.map(async (stackName) => {
            const result = await this.readStackOutputs(stackName, options);
            return { stackName, result };
        });
        const settledResults = await Promise.allSettled(promises);
        for (const settled of settledResults) {
            if (settled.status === 'fulfilled') {
                const { stackName, result } = settled.value;
                results[stackName] = result;
            }
            else {
                const stackName = stackNames.find(name => !results[name]);
                if (stackName) {
                    results[stackName] = {
                        success: false,
                        outputs: {},
                        error: settled.reason?.message || 'Unknown error',
                    };
                }
            }
        }
        const successCount = Object.values(results).filter(r => r.success).length;
        this.logger.info(`Successfully read outputs from ${successCount}/${stackNames.length} stacks`);
        return results;
    }
    /**
     * Wait for a stack to be in a specific status
     */
    async waitForStackStatus(stackName, targetStatus, options = {}) {
        const { profile, region, timeout = 900000, // 15 minutes
        pollInterval = 10000, // 10 seconds
         } = options;
        const startTime = Date.now();
        this.logger.info(`Waiting for stack '${stackName}' to reach status '${targetStatus}'`);
        while (Date.now() - startTime < timeout) {
            try {
                const result = await this.getStackStatus(stackName, { profile, region });
                if (result.status === targetStatus) {
                    this.logger.success(`Stack '${stackName}' reached status '${targetStatus}'`);
                    return { success: true, status: targetStatus };
                }
                // Check for failed states
                if (result.status?.includes('FAILED') || result.status?.includes('ROLLBACK')) {
                    this.logger.error(`Stack '${stackName}' reached failed status: ${result.status}`);
                    return {
                        success: false,
                        status: result.status,
                        error: `Stack reached failed status: ${result.status}`,
                    };
                }
                this.logger.debug(`Stack '${stackName}' status: ${result.status} (waiting for ${targetStatus})`);
                await this.sleep(pollInterval);
            }
            catch (error) {
                this.logger.warn(`Error checking stack status: ${error.message}`);
                await this.sleep(pollInterval);
            }
        }
        return {
            success: false,
            error: `Timeout waiting for stack '${stackName}' to reach status '${targetStatus}'`,
        };
    }
    /**
     * Get the current status of a stack
     */
    async getStackStatus(stackName, options = {}) {
        const { profile, region } = options;
        const args = ['cloudformation', 'describe-stacks', '--stack-name', stackName];
        if (profile) {
            args.push('--profile', profile);
        }
        if (region) {
            args.push('--region', region);
        }
        const result = await this.executor.execute('aws', args, { silent: true });
        if (!result.success) {
            return { error: result.stderr };
        }
        try {
            const response = JSON.parse(result.stdout);
            const stack = response.Stacks?.[0];
            return { status: stack?.StackStatus };
        }
        catch (error) {
            return { error: `Failed to parse response: ${error.message}` };
        }
    }
    /**
     * List all stacks with a name prefix
     */
    async listStacks(namePrefix, options = {}) {
        const { profile, region } = options;
        const args = ['cloudformation', 'list-stacks'];
        if (profile) {
            args.push('--profile', profile);
        }
        if (region) {
            args.push('--region', region);
        }
        // Filter by status (only active stacks)
        args.push('--stack-status-filter', 'CREATE_IN_PROGRESS', 'CREATE_COMPLETE', 'ROLLBACK_IN_PROGRESS', 'ROLLBACK_COMPLETE', 'DELETE_IN_PROGRESS', 'DELETE_FAILED', 'UPDATE_IN_PROGRESS', 'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS', 'UPDATE_COMPLETE', 'REVIEW_IN_PROGRESS');
        const result = await this.executor.execute('aws', args, { silent: true });
        if (!result.success) {
            return { stacks: [], error: result.stderr };
        }
        try {
            const response = JSON.parse(result.stdout);
            let stacks = response.StackSummaries?.map(s => s.StackName) || [];
            // Filter by prefix if provided
            if (namePrefix) {
                stacks = stacks.filter(name => name.startsWith(namePrefix));
            }
            return { stacks };
        }
        catch (error) {
            return { stacks: [], error: `Failed to parse response: ${error.message}` };
        }
    }
    /**
     * Utility method to sleep for a given number of milliseconds
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.StackOutputReader = StackOutputReader;
//# sourceMappingURL=StackOutputReader.js.map