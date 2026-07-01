import type { Request, Response, NextFunction } from 'express';

export interface CedarUser {
  sub: string;
  email: string;
  groups: string[];
}

export interface CedarDecision {
  allowed: boolean;
  principal: string;
  action: string;
  resource: string;
}

export interface CedarAuthOptions {
  /** AWS region for ALB public key endpoint. Default: AWS_REGION env var. */
  region?: string;
  /** Service name for Cedar resource entity. Default: SERVICE_NAME env var. */
  serviceName?: string;
  /** Paths that bypass authorization (no JWT required). Default: ["/healthz"]. */
  bypassPaths?: string[];
  /** Directory containing .cedar policy files. Default: "./cedar". */
  policyDir?: string;
  /**
   * ALB ARNs accepted as valid JWT signers. When set, the `signer` claim in
   * x-amzn-oidc-data is validated against this list to prevent JWT forgery
   * from other ALBs in the region.
   */
  allowedAlbArns?: string[];
  /** Watch policyDir for changes and hot-reload. Default: NODE_ENV !== "production". */
  watchPolicies?: boolean;
  /**
   * Skip ALB JWT verification and use devUser as the principal. NEVER use in
   * production — emits a console warning when active.
   */
  devMode?: boolean;
  devUser?: CedarUser;
  /** Called when Cedar denies access. Default: 403 JSON response. */
  onDeny?: (req: Request, res: Response, decision: CedarDecision) => void;
  /** Called when JWT verification or policy loading fails. Default: 500 JSON response. */
  onError?: (req: Request, res: Response, err: Error) => void;
}

// Augment Express Request to carry the resolved Cedar user downstream.
declare global {
  namespace Express {
    interface Request {
      cedarUser?: CedarUser;
    }
  }
}

export type { Request, Response, NextFunction };
