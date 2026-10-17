# GitHub authentication setup

Autolisty uses GitHub only to verify the identity of its single authorized owner. It does not request repository access.

## 1. Create the OAuth app

In GitHub, open **Settings > Developer settings > OAuth Apps > New OAuth App** and use:

- Application name: `Autolisty`
- Homepage URL: `https://autolisty.com`
- Authorization callback URL: `https://autolisty.com/api/auth/callback/github`

Keep wildcard callback matching disabled. After registering, create a client secret.

## 2. Find the allowed GitHub user ID

Open `https://api.github.com/users/CryptoLibo` and copy the numeric `id` value. The numeric ID is used instead of the login name because it does not change if the account is renamed.

## 3. Configure Hetzner

Add these variables to the production environment outside the Git repository:

```text
AUTH_GITHUB_ID=<OAuth client ID>
AUTH_GITHUB_SECRET=<OAuth client secret>
AUTH_SECRET=<long random application secret>
AUTH_TRUST_HOST=true
AUTOLISTY_GITHUB_USER_ID=<numeric GitHub user ID>
AUTOMATION_DB_PATH=/var/lib/autolisty/automation.sqlite
```

Generate `AUTH_SECRET` on the server with:

```bash
openssl rand -base64 32
```

Never place the resulting values in Git, documentation, screenshots, or chat messages.

## 4. Deploy

Run the normal server deployment and restart PM2 through `./deploy.sh`. Keep PM2 at one Autolisty instance while Automation uses SQLite.

## 5. Verify

1. Open `https://autolisty.com` in a private browser window.
2. Confirm that Autolisty redirects to `/login`.
3. Sign in with the authorized GitHub account.
4. Confirm that another GitHub account receives an access-denied message.
5. Confirm that About, Contact, Privacy Policy, and Terms remain public.

## GitHub MFA

In GitHub, open **Settings > Password and authentication** and enable two-factor authentication. Prefer a passkey or authenticator application, store the recovery codes offline, and add a second recovery method before finishing setup.
