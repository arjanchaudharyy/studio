## 🧭 **Product Requirements Document (PRD)**

### **Goal**

Automatically scan a Supabase project using only its credentials and output a complete configuration-security report covering Auth, Database, Storage, API/Keys, and Function exposure.

---

### **Scope**

* Inputs: `supabase_url`, `service_role_key`, optional `project_ref`.
* Scan what’s accessible via Supabase client (`@supabase/supabase-js`) and Postgres queries via service key.
* Detect misconfigurations, weak security defaults, or public exposure.
* Output structured results (JSON/CSV).
* No UI; designed to be invoked as a backend component or CLI command.

---

### **Inputs**

```json
{
  "supabase_url": "https://xyz.supabase.co",
  "service_role_key": "SUPABASE_SERVICE_ROLE_KEY",
  "project_ref": "abcd1234",
  "output_format": "json"
}
```

Optional flags:

* `"include_env_scan": true` – parses `.env` or config files for key exposure
* `"include_edge_functions": true` – checks deployed Edge functions metadata

---

### **Outputs**

**Format:** JSON or CSV
**Example:**

```json
{
  "summary": {
    "score": 82,
    "checks_total": 20,
    "checks_failed": 4
  },
  "findings": [
    {
      "id": "DB_RLS_PUBLIC_TABLE",
      "severity": "high",
      "message": "Table 'users' in public schema has RLS disabled.",
      "remediation": "Enable RLS: ALTER TABLE users ENABLE ROW LEVEL SECURITY;"
    },
    {
      "id": "STORAGE_PUBLIC_BUCKET",
      "severity": "high",
      "message": "Bucket 'avatars' is public.",
      "remediation": "Set the bucket to private or use signed URLs."
    }
  ]
}
```

## 🔍 **Checks Possible with Supabase Credentials**

### 🗄️ **Database Checks**

| ID                       | Check                             | Method                   | Severity | Description                                 |
| ------------------------ | --------------------------------- | ------------------------ | -------- | ------------------------------------------- |
| DB_RLS_PUBLIC_TABLE      | RLS enabled on all public tables  | SQL query to `pg_class`  | High     | Tables in `public` schema with RLS disabled |
| DB_NO_POLICY             | Missing RLS policies              | `pg_policies`            | High     | Tables with RLS but no policies defined     |
| DB_SUPERUSER_ROLE_EXISTS | Unexpected roles with superuser   | `pg_roles`               | High     | Detects unnecessary superuser roles         |
| DB_FUNCTION_PUBLIC       | Public access to unsafe functions | `pg_proc`                | Medium   | Flags functions accessible by public        |
| DB_LOGGING_DISABLED      | Logging not enabled               | SQL `SHOW log_statement` | Medium   | Warns if database logging is off            |
| DB_SSL_DISABLED          | SSL off                           | `SHOW ssl`               | High     | Ensures data in transit is encrypted        |
| DB_EXTENSIONS_RISKY      | Unapproved extensions             | `pg_extension`           | Medium   | Detects loaded extensions (e.g., `dblink`)  |

---

### 🔑 **Auth Checks**

| ID                          | Check                        | Method              | Severity | Description                              |
| --------------------------- | ---------------------------- | ------------------- | -------- | ---------------------------------------- |
| AUTH_EMAIL_CONFIRM_DISABLED | Email confirmations required | `/auth/v1/settings` | Medium   | Users can sign in without verified email |
| AUTH_MFA_DISABLED           | MFA enabled                  | `/auth/v1/settings` | Medium   | Warns if MFA not enforced                |
| AUTH_PASSWORD_POLICY_WEAK   | Password min length < 8      | `/auth/v1/settings` | Medium   | Weak password policy                     |
| AUTH_ALLOW_SIGNUPS_TRUE     | Unrestricted user signups    | `/auth/v1/settings` | Low      | May be fine for dev but risky in prod    |
| AUTH_TOKEN_EXPIRY_LONG      | JWT expiry > 1h              | `/auth/v1/settings` | Medium   | Longer expiry increases token theft risk |
| AUTH_ANON_KEY_EXPOSED       | Anon key in env/frontend     | local scan          | High     | Detects frontend exposure of anon key    |

---

### 🗂️ **Storage Checks**

| ID                           | Check                         | Method                 | Severity | Description                         |
| ---------------------------- | ----------------------------- | ---------------------- | -------- | ----------------------------------- |
| STORAGE_PUBLIC_BUCKET        | Buckets public by default     | `/storage/v1/bucket`   | High     | Lists any bucket with `public=true` |
| STORAGE_SIGNED_URLS_DISABLED | Signed URLs not enforced      | `/storage/v1/bucket`   | Medium   | Files may be accessed directly      |
| STORAGE_VERSIONING_DISABLED  | Versioning disabled           | metadata query         | Low      | May lose audit trail                |
| STORAGE_RISKY_POLICY         | Broad storage access policies | `/storage/v1/policies` | Medium   | Flags overly broad access controls  |

---

### ⚙️ **API & Function Checks**

| ID                                | Check                         | Method                    | Severity | Description                                    |
| --------------------------------- | ----------------------------- | ------------------------- | -------- | ---------------------------------------------- |
| API_SERVICE_ROLE_USED_IN_FRONTEND | Service role used client-side | env scan                  | High     | Detects service key in frontend or public file |
| API_KEY_ROTATION_DISABLED         | Old keys active > 90d         | `/projects/{id}/api-keys` | Medium   | Encourages rotation                            |
| API_RATE_LIMIT_DISABLED           | Rate limiting off             | `/rest/v1/settings`       | Low      | Optional but good practice                     |
| EDGE_FUNCTION_PUBLIC              | Edge functions public         | `/functions/v1/list`      | Medium   | Detects public functions without auth guard    |

---

### 🧰 **Environment / Config Checks**

| ID                       | Check                      | Method       | Severity | Description                 |
| ------------------------ | -------------------------- | ------------ | -------- | --------------------------- |
| ENV_SERVICE_ROLE_EXPOSED | service_role in env or git | parse `.env` | High     | Should never be in frontend |
| ENV_ANON_EXPOSED_OK      | anon key safe              | parse `.env` | Info     | Allowed for frontend use    |
| ENV_URL_HTTPS            | Supabase URL uses HTTPS    | simple check | High     | Must always be HTTPS        |

---

### 🧾 **SQL Query Snippets Used**

**RLS status**

```sql
SELECT nspname AS schema, relname AS table, relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE relkind = 'r';
```

**Policies count**

```sql
SELECT schemaname, tablename, count(*) AS policies
FROM pg_policies GROUP BY schemaname, tablename;
```

**Roles**

```sql
SELECT rolname, rolsuper FROM pg_roles;
```

**Extensions**

```sql
SELECT extname FROM pg_extension;
```

---

## 🧮 **Output Scoring**

| Severity | Weight | Description             |
| -------- | ------ | ----------------------- |
| High     | -10    | Security-critical issue |
| Medium   | -5     | Recommended fix         |
| Low      | -2     | Informational           |
| Info     | 0      | Pass / no action        |

Score = 100 – (sum of weights for failed checks)

---

## 🧱 **Implementation Steps**

1. **Connect to Supabase**
   `createClient(supabase_url, service_role_key)`

2. **Run all fetchers**

   * SQL queries for DB checks
   * HTTP requests for Auth/Storage/API
   * Optional `.env` file parser

3. **Pass data into rule engine**
   Each rule = simple JS function returning `{pass: boolean, message, severity}`

4. **Aggregate findings**
   Compute total, failed, and score.

5. **Generate report**

   * JSON (`findings.json`)
   * Optional CSV (via `json2csv`)

