/**
 * Feature flags for temporarily disabling features that aren't ready for
 * release. Flip a flag to `true` to re-enable the feature.
 */

// Google Drive / Workspace integration is hidden until the Google OAuth client
// (PKCE, "Desktop app" type) is configured — see src/ipc/google/google_drive_auth.ts.
export const GOOGLE_DRIVE_INTEGRATION_ENABLED = false;
