/**
 * Structured logging utility using Winston
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export declare class Logger {
    private logger;
    private component;
    constructor(component: string, logLevel?: LogLevel);
    debug(message: string, meta?: any): void;
    info(message: string, meta?: any): void;
    warn(message: string, meta?: any): void;
    error(message: string, error?: Error | any): void;
    success(message: string, meta?: any): void;
    failure(message: string, error?: Error | any): void;
    startOperation(operation: string): void;
    completeOperation(operation: string, duration?: number): void;
    failOperation(operation: string, error?: Error | any): void;
    layerVerify(layerName: string, result: {
        skip: boolean;
        reason?: string;
    }): void;
    layerDeploy(layerName: string): void;
    layerDeployed(layerName: string, duration?: number): void;
    layerDestroyed(layerName: string): void;
    commandStart(command: string, cwd?: string): void;
    commandComplete(command: string, exitCode: number, duration: number): void;
    healthCheck(url: string, healthy: boolean, responseTime?: number): void;
    setLevel(level: LogLevel): void;
    child(additionalComponent: string): Logger;
}
//# sourceMappingURL=Logger.d.ts.map