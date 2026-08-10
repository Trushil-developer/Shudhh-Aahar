# Backend Infrastructure

The backend is provisioned by **Terraform** (`terraform/`), which is the current, actually-applied
source of truth (see [Terraform vs `amplify/backend`](#terraform-vs-amplifybackend) below).
Region: `eu-west-2` (London), per `terraform/variables.tf`.

## Cognito (`terraform/cognito.tf`)

- User pool (`aws_cognito_user_pool.main`): username = email, auto-verifies email, password
  policy (min 8 chars, requires lowercase + numbers), custom schema attributes `email` (required)
  and `name` (optional).
- **Google** configured as a federated identity provider (`aws_cognito_identity_provider.google`),
  mapping email/name/sub/picture.
- App client (`aws_cognito_user_pool_client.mobile`): no client secret, OAuth authorization-code
  flow, scopes `openid email profile`, supports both Google and native Cognito, SRP/refresh/custom
  auth flows, 1hr access/id tokens, 30-day refresh token.
- Hosted UI domain (`aws_cognito_user_pool_domain.main`): `${app_name}-auth-${env}`.

## AppSync (`terraform/appsync.tf`)

- GraphQL API, auth mode `AMAZON_COGNITO_USER_POOLS`, schema loaded from `terraform/schema.graphql`.
- Two DynamoDB data sources: `UserTable` and `ScanHistoryTable`, both via the `aws_iam_role.appsync`
  IAM role.
- **Five hand-written APPSYNC_JS (1.0.0) unit resolvers — no Lambda in the request path:**
  - `getUser` — GetItem
  - `listScanHistories` — Query/Scan, uses the `byUserId` GSI when filtering by user
  - `createUser` — PutItem, with a conditional-check-failure fallback for repeat logins
  - `updateUser` — dynamic UpdateItem, gated by `ctx.identity.sub == owner`
  - `createScanHistory` — PutItem
  - `deleteScanHistory` — DeleteItem, gated by owner
- **Authorization is enforced entirely inside the JS resolver logic** (`ctx.identity.sub` checks),
  not via schema `@auth` directives — the schema itself has none.

## DynamoDB (`terraform/dynamodb.tf`)

| Table | Billing | Keys |
|---|---|---|
| `User-${app_name}-${env}` | PAY_PER_REQUEST | hash key `id` (S) |
| `ScanHistory-${app_name}-${env}` | PAY_PER_REQUEST | hash key `id` (S), GSI `byUserId` (hash key `userId`, projection ALL) |

## IAM (`terraform/iam.tf`)

- Role `aws_iam_role.appsync`, trusted by `appsync.amazonaws.com`.
- Inline policy `DynamoDBAccess`: GetItem/PutItem/UpdateItem/DeleteItem/Query/Scan on both tables
  and their indexes.

## GraphQL schema (`terraform/schema.graphql`)

- `Medication` — name (required), dosage, frequency, reason.
- `HealthProfile` — allergies, intolerances, allergyNotes, conditions, conditionNotes,
  medications (list of `Medication`), dietType, dietaryRestrictions, exerciseLevel,
  alcoholConsumption, smokingStatus, age, gender, weightKg, heightCm, healthGoals.
- `User` — id, email (required), name, profileComplete, healthProfile, createdAt/updatedAt.
- `ScanHistory` — id, userId (required), barcode (required), productName, brand, scannedAt,
  warnings (list), cheapestPrice, cheapestStore, createdAt/updatedAt.
- Supporting types: `ModelScanHistoryConnection` (items + `nextToken`), string/filter input types,
  and matching Create/Update/Delete inputs.
- **Root `Query`**: `getUser(id)`, `listScanHistories(filter, limit, nextToken)`.
- **Root `Mutation`**: `createUser`, `updateUser`, `createScanHistory`, `deleteScanHistory`.
- Note the schema has no `listUsers`/`getScanHistory`, and no `updateScanHistory` — scan history
  records are create-and-delete only once written.

## Terraform inputs & outputs

**Inputs** (`terraform/variables.tf`):

| Variable | Default | Notes |
|---|---|---|
| `app_name` | `"shuddhaahar"` | |
| `env` | `"prod"` | |
| `aws_region` | `"eu-west-2"` | |
| `google_client_id` | *(required)* | |
| `google_client_secret` | *(required)* | marked sensitive |
| `app_redirect_uri` | `"shuddhaahar://"` | |

**Outputs** (`terraform/outputs.tf`): `aws_region`, `cognito_user_pool_id`,
`cognito_user_pool_client_id`, `cognito_domain`, `appsync_endpoint`, `user_table_name`,
`scan_history_table_name`.

An example `terraform.tfvars.example` is provided; the repo also contains a real `terraform.tfvars`
— the stack has already been deployed.

## State backend (`terraform/state_backend.tf`)

State lives in S3 (`shuddhaahar-terraform-state-195275671852`, versioned, SSE-S3 encrypted, public
access blocked, TLS-and-encrypted-upload-only bucket policy), configured via the `backend "s3"`
block in `providers.tf`. Locking uses Terraform's native S3 lockfile support (`use_lockfile = true`,
needs Terraform ≥ 1.10) — no separate DynamoDB lock table.

This replaced local state (`terraform.tfstate` / `.tfstate.backup`, no longer present) because local
state stored every `random_password` secret — including `admin_token_secret`, the HMAC key that
signs admin session tokens — as plaintext JSON on disk. `admin_token_secret` was rotated as part of
this migration (`terraform apply -replace=random_password.admin_token_secret`); any previously
issued admin session is invalid and requires signing in again.

Nothing extra is needed to use this — `terraform init` picks up the backend automatically from
`providers.tf`. Only re-run `terraform init -migrate-state` if the backend block itself changes.

## Deploying / re-deploying

```bash
cd terraform
terraform init
terraform apply
bash apply-and-configure.sh   # writes ../aws-exports.js from terraform output
```

`apply-and-configure.sh` reads `terraform output -json`, extracts region/pool id/client
id/domain/AppSync endpoint via `jq`, and writes an Amplify-style config object into the app root's
`aws-exports.js` (Cognito user pools + AppSync with Cognito user-pool auth, Google OAuth redirect
`shuddhaahar://`). Re-run it any time the Terraform outputs change, then rebuild the app.

## Tearing down (stop paying for it)

Both tables are `PAY_PER_REQUEST` (no idle cost) and Cognito/AppSync have no fixed monthly fee on
their own, so this stack is cheap to leave running — the AWS bill risk here is closer to "some
request volume gets billed" than "a fixed instance keeps charging." Tear it down when you want a
hard guarantee of zero AWS spend from this project (e.g. between active development periods), or
before handing the AWS account to someone else.

```bash
cd terraform
terraform destroy
```

- Review the plan Terraform prints before confirming — it should list exactly the 17 resources in
  [DynamoDB](#dynamodb-terraformdynamodbtf) / [AppSync](#appsync-terraformappsynctf) /
  [Cognito](#cognito-terraformcognitotf) / [IAM](#iam-terraformiamtf) above, nothing else.
- **This deletes both DynamoDB tables and everything in them** — every user record and scan
  history row, permanently. There's no snapshot/backup step in this repo. If you need the data,
  export it first (e.g. `aws dynamodb scan --table-name User-shuddhaahar-prod > user-backup.json`
  and the same for `ScanHistory-shuddhaahar-prod`).
- It also deletes the Cognito user pool, so every signed-up user loses their account and has to
  register again after the next `terraform apply` — pool IDs are not reused.
- `aws-exports.js` is **not** updated by `terraform destroy` — it's left pointing at the
  now-deleted resources. The app will fail auth and all GraphQL calls until you either regenerate
  it after a fresh `apply`, or stop running the app against this environment.
- To confirm nothing is left after destroying:
  ```bash
  aws dynamodb list-tables --region eu-west-2
  aws cognito-idp list-user-pools --max-results 20 --region eu-west-2
  aws appsync list-graphql-apis --region eu-west-2
  ```
  All three should return empty lists.

## Terraform vs `amplify/backend`

`amplify/backend/` contains only `amplify/backend/api/shuddhaahar/schema.graphql` — leftover source
material with a comment header telling a developer to run `amplify add api` and paste it in. There
is no `backend-config.json`, `team-provider-info.json`, `cli.json`, or any other Amplify CLI
scaffolding — **it was never actually deployed as an Amplify project.** Its schema uses
`@model`/`@auth(rules:[{allow:owner}])` directives, a different authorization model than the
Terraform stack (which enforces ownership in resolver code instead).

**`terraform/schema.graphql` is the current, applied source of truth** — it's a hand-expanded
version of the same data model (adds Create/Update/Delete inputs, filters, connection types) and
is backed by live, applied infrastructure. Treat `amplify/backend/` as historical reference only;
don't run `amplify push` against it without reconciling first.

## Admin panel (`admin/index.html`)

A single-file, client-only "Shuddh Aahar Admin" dashboard mockup: user management (ban/delete), T&C/CMS
editor, contact-message replies, cost breakdown, service status, audit log, and Chart.js charts.

**It is not wired to the real backend.** There are no `fetch`/XHR calls to AppSync or any reference
to `aws-exports.js` or the Cognito SDK anywhere in the file:
- Login checks against a hardcoded credential object in the page source
  (`info@shuddhaahar.shop` / a hardcoded password), with MFA satisfiable by the real code or a
  fixed bypass code — i.e. fake, client-side-only auth.
- All "data" (users, service status, cost rows, charts) is hardcoded or generated with
  `Math.random()`.

Treat this as a **UI prototype/demo**, not a production admin console — see
[Known Issues](KNOWN_ISSUES.md) for the security implications if this file is ever deployed
publicly as-is.
