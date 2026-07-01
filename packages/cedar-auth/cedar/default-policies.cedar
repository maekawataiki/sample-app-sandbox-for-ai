// Default policy: permit all authenticated users to access all endpoints.
// This matches the current platform behavior (Cognito-authenticated = full access).
// Override by placing .cedar files in your service's cedar/ directory.
permit(
  principal is Prototype::User,
  action,
  resource
);
