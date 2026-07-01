export { createCedarAuth } from './middleware.js';
export { authorize as authorizeRequest } from './cedar-engine.js';
export type { CedarUser, CedarAuthOptions, CedarDecision } from './types.js';

// Standalone authorize function for Lambda (non-Express) handlers.
export { standaloneAuthorize } from './standalone.js';
