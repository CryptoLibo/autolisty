# Autolisty local production agent

This agent runs only on the production Windows PC. It polls Autolisty over outbound HTTPS, downloads one assigned source, verifies its SHA-256 checksum, runs Autobuildy in nonvisual automation mode, validates the final listing, uploads each approved output directly to R2 through short-lived signed URLs, and reports completion.

It never receives R2, Etsy, Pinterest, GitHub, or database credentials.

## Local files

- `config.json`: machine paths and non-secret settings. Copy from `config.example.json`.
- `secrets/agent-token.txt`: the original machine token, on one line.
- `state/current-job.json`: atomic recovery checkpoint.
- `jobs/<product-code>/`: temporary source, Autobuildy request, and result checkpoint.
- `logs/agent.log`: local operational log without secrets.

All runtime paths are rooted under `spoolRoot`. The agent removes a completed job workspace and Autobuildy's temporary `Listing 1` only after R2 has verified every required output and Autolisty has accepted `LOCAL_COMPLETE`.

## Run during development

```powershell
node .\local-agent\agent.mjs --config C:\AutolistyAgent\config.json
```

## Install on the old PC

The PC needs Node.js 20 or newer, Autobuildy 0.2.12, Photoshop 2026, and Upscayl. Photoshop requires an interactive Windows session, so the task starts at user logon rather than as a background Windows service.

1. Create `C:\AutolistyAgent\secrets\agent-token.txt` with the machine token.
2. Run PowerShell as administrator from this folder.
3. Install the task:

```powershell
.\install-task.ps1 -AutobuildyExecutable "C:\Users\YOUR_USER\Desktop\Autobuildy\release\win-unpacked\Autobuildy.exe"
```

The installer restricts the secret ACL to the current Windows user and registers `Autolisty Production Agent` with restart-on-failure. Runtime files are preserved when `uninstall-task.ps1` removes the scheduled task.

Do not expose an inbound port or Windows share. Configure Windows to keep this user logged in, disable sleep, and allow the display to turn off independently.
