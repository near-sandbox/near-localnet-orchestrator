/**
 * Zod schemas for configuration validation
 */

import { z } from 'zod';

// Layer source configuration
const LayerSourceSchema = z.object({
  repo_url: z.string().url(),
  branch: z.string().default('main'),
  cdk_path: z.string().optional(),
  script_path: z.string().optional(),
}).refine((data) => data.cdk_path || data.script_path, {
  message: 'Either cdk_path or script_path must be provided',
});

// Individual layer configuration
const LayerConfigSchema = z.object({
  enabled: z.boolean().default(true),
  depends_on: z.array(z.string()).optional(),
  source: LayerSourceSchema,
  config: z.record(z.any()),
});

// Global configuration
const GlobalConfigSchema = z.object({
  aws_profile: z.string(),
  aws_region: z.string().default('us-east-1'),
  aws_account: z.string(),
  workspace_root: z.string().default('./workspace'),
  log_level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  continue_on_error: z.boolean().default(false),
});

// Main configuration schema
export const SimulatorsConfigSchema = z.object({
  global: GlobalConfigSchema,
  layers: z.record(LayerConfigSchema),
});

// Export types inferred from schemas
export type LayerSource = z.infer<typeof LayerSourceSchema>;
export type LayerConfig = z.infer<typeof LayerConfigSchema>;
export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;
export type SimulatorsConfig = z.infer<typeof SimulatorsConfigSchema>;

// Validation helper functions
export function validateConfig(config: unknown): SimulatorsConfig {
  return SimulatorsConfigSchema.parse(config);
}

export function validateConfigSafe(config: unknown): {
  success: boolean;
  data?: SimulatorsConfig;
  error?: z.ZodError;
} {
  const result = SimulatorsConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, error: result.error };
  }
}
