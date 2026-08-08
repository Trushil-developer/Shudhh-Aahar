# Shuddhaahar Documentation

Deep-dive technical documentation for the Shuddhaahar app, generated from a full read of the
codebase. Start here, then follow the links below for the area you need.

| Doc | Covers |
|---|---|
| [Architecture Overview](ARCHITECTURE.md) | Tech stack, folder structure, app bootstrap state machine, core product data flow |
| [Screens & Components](SCREENS_AND_COMPONENTS.md) | Every screen, component, context, hook, and theme tokens |
| [Services & Utils](SERVICES_AND_UTILS.md) | Every service (AI, food/price APIs, AWS, IAP, HealthKit), environment config, and utility module |
| [Backend Infrastructure](BACKEND_INFRASTRUCTURE.md) | Terraform-provisioned AWS resources (Cognito, AppSync, DynamoDB, IAM), GraphQL schema, admin panel, deploy/**teardown** steps |
| [Build, Test & Deploy](BUILD_TEST_DEPLOY.md) | Environments, local dev, CI/CD pipeline, release process, testing setup |
| [Known Issues](KNOWN_ISSUES.md) | Security notes, functional bugs, and doc/code mismatches found while writing this documentation |
| [Roadmap](ROADMAP.md) | Startup roadmap: production-readiness, UK legal/business setup, UK launch plan, India expansion, multi-country framework |

For AWS/Google credential setup steps, see [AWS_SETUP_GUIDE.md](../AWS_SETUP_GUIDE.md) at the repo
root. For quick-start commands, see the root [README.md](../README.md).

**⚠️ Read [Known Issues](KNOWN_ISSUES.md) first** — it flags a live-looking API key currently
committed in source (`src/config/environment.ts`) that should be rotated.
