# Local production agent security setup

Configure the machine token only during the controlled old-PC installation.

## Credential model

The old PC stores one random bearer token. Hetzner stores only its SHA-256 hash in `AUTOMATION_AGENT_TOKEN_SHA256`. Autolisty cannot reconstruct the original token from that hash.

The PC always initiates outbound HTTPS connections to `https://autolisty.com`. Do not open an inbound router port, Windows file share, database port, or public remote-control endpoint for Automation.

## Generate the credential on Windows

Run in PowerShell on a trusted PC:

```powershell
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$token = [Convert]::ToBase64String($bytes)
$sha = [Security.Cryptography.SHA256]::Create()
$hashBytes = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($token))
$sha.Dispose()
$hash = ([BitConverter]::ToString($hashBytes)).Replace('-', '').ToLowerInvariant()
```

- Store `$token` only in `C:\AutolistyAgent\secrets\agent-token.txt` on the old PC.
- Store `$hash` only as `AUTOMATION_AGENT_TOKEN_SHA256` in Hetzner.
- Never place either value in Git, screenshots, documentation, or chat.

Generating a replacement token immediately revokes the old one after the server environment is updated and Autolisty is restarted.

## Agent request boundary

Every agent request must include:

```text
Authorization: Bearer <machine token>
X-Autolisty-Agent-Id: old-production-pc
```

The server constrains the agent ID format, compares token hashes in constant time, assigns one job at a time, and only permits local production status transitions. The machine credential cannot access owner-only Etsy, Pinterest, Prompt Lab, Image Lab, or browser intake APIs.

## Output upload boundary

For each locally validated file, the agent requests a signed R2 PUT URL that expires after 15 minutes and is restricted to the current product code and contract slot. The URL does not reveal R2 credentials. Autolisty verifies byte size and SHA-256 object metadata with R2 before marking the file verified.

The server rejects unknown paths, parent-directory traversal, extra deliverables, unexpected media slots, and completion with missing files. A local error pauses that job in `NEEDS_ATTENTION`; the agent will not retry it until the authenticated owner uses the retry control in Autolisty.
