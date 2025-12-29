/**
 * Health checking utilities for various services
 */
import { AxiosResponse } from 'axios';
import { Logger } from './Logger';
import { CommandExecutor } from './CommandExecutor';
import { HealthCheckResult } from '../types';
export interface RpcStatusResponse {
    version: {
        version: string;
        build: string;
    };
    chain_id: string;
    protocol_version: number;
    latest_protocol_version: number;
    rpc_addr?: string;
    validators?: any[];
    sync_info: {
        latest_block_hash: string;
        latest_block_height: number;
        latest_block_time: string;
        latest_state_root: string;
        syncing: boolean;
    };
    validator_account_id?: string;
    validator_public_key?: string;
    node_public_key?: string;
    uptime_sec: number;
}
export declare class HealthChecker {
    private logger;
    private commandExecutor;
    private defaultTimeout;
    private awsProfile?;
    private awsRegion?;
    constructor(logger?: Logger, commandExecutor?: CommandExecutor, defaultTimeout?: number, awsProfile?: string, awsRegion?: string);
    /**
     * Check NEAR RPC endpoint health with thorough verification
     */
    checkRpc(url: string, expectedNetworkId?: string, timeout?: number): Promise<HealthCheckResult>;
    /**
     * Test actual RPC functionality by making a block query
     */
    private testRpcFunctionality;
    /**
     * Test validator information
     */
    private testValidatorInfo;
    /**
     * Check HTTP endpoint health with custom validation
     */
    checkHttp(url: string, options?: {
        timeout?: number;
        expectedStatus?: number;
        validator?: (response: AxiosResponse) => boolean;
    }): Promise<HealthCheckResult>;
    /**
     * Check MPC node health with thorough verification
     */
    checkMpcNode(nodeUrl: string, nearRpcUrl?: string, expectedContractId?: string, timeout?: number, instanceId?: string): Promise<HealthCheckResult>;
    /**
     * Perform full MPC health checks when external access works
     */
    private performFullMpcChecks;
    /**
     * Check MPC node health via AWS SSM when external access fails
     */
    private checkMpcNodeViaSSM;
    /**
     * Test MPC node's communication with NEAR network
     */
    private testMpcNearCommunication;
    /**
     * Test MPC contract interaction
     */
    private testMpcContractInteraction;
    /**
     * Check multiple endpoints and return aggregate health
     */
    checkMultiple(endpoints: Array<{
        url: string;
        type: 'rpc' | 'http';
        options?: any;
    }>): Promise<{
        overall: boolean;
        results: Array<{
            url: string;
            result: HealthCheckResult;
        }>;
    }>;
    /**
     * Wait for an endpoint to become healthy with retries
     */
    waitForHealthy(url: string, type?: 'rpc' | 'http', options?: {
        maxRetries?: number;
        retryInterval?: number;
        timeout?: number;
    }): Promise<HealthCheckResult>;
    /**
     * Check if a TCP port is open
     */
    checkTcp(host: string, port: number, timeout?: number): Promise<HealthCheckResult>;
    /**
     * Utility method to sleep for a given number of milliseconds
     */
    private sleep;
}
//# sourceMappingURL=HealthChecker.d.ts.map