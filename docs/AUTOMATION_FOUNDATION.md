# Automation foundation

This phase establishes the server-side contracts and the first complete local-production boundary. It does not expose the old production PC to inbound Internet traffic.

## Stable identity

Every design receives one immutable product code when it enters Autolisty:

```text
LBCreaStudio-XXXXXX
```

The same code identifies its queue record, local production folder, Etsy work, Pinterest work, and final R2 folder. The `LBCreaStudio-` prefix is part of the identity from creation onward; it must not be added only during upload.

## Persistent queue

Automation state is stored in SQLite through `AUTOMATION_DB_PATH`. Production must use an absolute path outside the Git checkout, for example:

```text
/var/lib/autolisty/automation.sqlite
```

The database keeps jobs, files, steps, events, retries, leases, Etsy draft assignments, and pipeline mode. Source backups are temporary: once the local PC verifies receipt and the corresponding design reaches the agreed durable state, the temporary object can be deleted while the job record remains auditable.

Only one production-blocking job can be active. A pause request changes the mode to `STOPPING_AFTER_CURRENT`; the active product continues until its Etsy draft is ready, then the queue becomes `PAUSED` before another design starts.

## Product contracts

`lib/automation/productContracts.ts` is the source of truth for source-file rules, listing slots, Pinterest image counts, and customer delivery requirements. Manual and automatic flows should consume the same contracts as integration proceeds.

## Local PC boundary

The production agent makes outbound HTTPS requests to `autolisty.com`. No inbound port, public file share, remote database, or direct Internet route to the PC is required. Agent authentication is separate from the GitHub owner login and uses a revocable machine credential.

The local root path must come from PC-specific configuration. Job metadata stores relative paths, never a hardcoded user profile such as `C:\\Users\\...`. This allows the same code to move from the new PC to the old PC after copying the approved production folders.

## Implemented security boundary

Interactive access uses GitHub OAuth and an immutable numeric GitHub user ID allowlist. Public legal/contact pages remain available; the workspace and private APIs require the owner session. State-changing browser API calls also require a same-origin request.

GitHub OAuth secrets and the automation database are external deployment state. Neither belongs in Git or in a migration archive.

## Implemented intake and control

The Automation workspace provides authenticated design intake, visual queue history, temporary source backup, product-specific Etsy draft pools, graceful start/pause control, visible production errors, and owner-authorized retry from the last safe step. The local-agent API supports heartbeat, job claim, protected source download, lease renewal, constrained status reporting, direct R2 output upload, and server-side output verification.

The agent API is intentionally exempt from the GitHub browser session and same-origin browser check. It has a separate bearer credential whose SHA-256 hash is stored on the server. Every agent route performs that machine authentication itself. This exception must never be extended to ordinary browser APIs.

## Implemented local production

`local-agent/agent.mjs` is the portable Windows runner. Autobuildy 0.2.12 accepts a hidden `--automation-request` file and uses the same production functions as its desktop interface. It checkpoints mockup selection, listing preparation, Upscayl, and Photoshop assembly so a machine restart can continue without selecting different mockups.

The agent validates the established listing contract before upload. R2 uploads use 15-minute signed URLs scoped to one approved key; the PC never receives R2 credentials. Autolisty confirms object size and SHA-256 metadata before accepting a slot. `LOCAL_COMPLETE` is rejected until every required listing image, Pinterest image, and customer deliverable is verified. The temporary source is then deleted from R2 and Autobuildy's `Listing 1` workspace is released.

## Next integration phase

The next phase connects `LOCAL_COMPLETE` to Etsy draft assignment and the existing SEO, delivery, Etsy sync, review, and Pinterest operations. Before unattended production is enabled, GitHub OAuth, the persistent production database, the machine-token hash, and the old-PC agent configuration must be deployed and tested with one controlled listing.
