# Release and rollback

No release of this branch has been performed. Before deploying, verify parity, security, RLS, provider connectivity, frontend/backend routing, real-browser checks and CI; snapshot the production data and record the current deployment and configuration. Do not commit credentials or run costly scans without authorization.

If a future deployment fails, use Vercel's deployment rollback to restore the last known-good production deployment and separately restore any backend version/configuration. Restore data only from a verified backup following an explicitly approved recovery plan. This rollback procedure has not been exercised. Browser-local projects are not backed up by a Vercel rollback.
