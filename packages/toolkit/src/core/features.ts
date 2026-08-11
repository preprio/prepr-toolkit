import type {
  PreprFeatureConfig,
  PreprFeatures,
  ResolvedPreprFeatures,
} from './types';

function isEnabled(config: PreprFeatureConfig | undefined): boolean {
  if (typeof config === 'boolean') return config;
  return config?.enabled ?? true;
}

/**
 * Resolve a `PreprFeatures` bag to plain booleans, defaulting every omitted key
 * to enabled. Shared by the toolbar and the middleware so both sides agree on
 * what a given config means.
 */
export function resolveFeatures(
  features?: PreprFeatures
): ResolvedPreprFeatures {
  return {
    segments: isEnabled(features?.segments),
    abTesting: isEnabled(features?.abTesting),
    editMode: isEnabled(features?.editMode),
  };
}

/** Every feature on — the shape a store starts with before options are read. */
export const ALL_FEATURES_ENABLED: ResolvedPreprFeatures = Object.freeze({
  segments: true,
  abTesting: true,
  editMode: true,
});
