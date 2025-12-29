/**
 * AWS CloudFormation stack output reader
 */
import { Logger } from '../utils/Logger';
export interface StackOutputResult {
    success: boolean;
    outputs: Record<string, string>;
    error?: string;
}
export declare class StackOutputReader {
    private logger;
    private executor;
    constructor(logger?: Logger);
    /**
     * Read outputs from a CloudFormation stack
     */
    readStackOutputs(stackName: string, options?: {
        profile?: string;
        region?: string;
        maxRetries?: number;
    }): Promise<StackOutputResult>;
    /**
     * Read outputs from a single stack
     */
    private readStackOutputsOnce;
    /**
     * Read outputs from multiple stacks
     */
    readMultipleStackOutputs(stackNames: string[], options?: {
        profile?: string;
        region?: string;
        maxRetries?: number;
    }): Promise<Record<string, StackOutputResult>>;
    /**
     * Wait for a stack to be in a specific status
     */
    waitForStackStatus(stackName: string, targetStatus: string, options?: {
        profile?: string;
        region?: string;
        timeout?: number;
        pollInterval?: number;
    }): Promise<{
        success: boolean;
        status?: string;
        error?: string;
    }>;
    /**
     * Get the current status of a stack
     */
    getStackStatus(stackName: string, options?: {
        profile?: string;
        region?: string;
    }): Promise<{
        status?: string;
        error?: string;
    }>;
    /**
     * List all stacks with a name prefix
     */
    listStacks(namePrefix?: string, options?: {
        profile?: string;
        region?: string;
    }): Promise<{
        stacks: string[];
        error?: string;
    }>;
    /**
     * Utility method to sleep for a given number of milliseconds
     */
    private sleep;
}
//# sourceMappingURL=StackOutputReader.d.ts.map