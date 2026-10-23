# James voice pilot

## Architecture and scope

Voice is an optional input/output layer over the existing Company conversation and task runner: browser recording -> OpenAI transcription -> the existing James text request (including `get_jobs`) -> OpenAI speech. It does not create another assistant, conversation, tool policy or commercial workflow. Text and Telegram remain on their existing routes. Voice is turn-based; the user can stop playback and speak again, but speaking over James is not detected automatically.

The chained approach preserves James's existing model, conversation history and authorization at the cost of higher latency than a bidirectional Realtime session. Browser microphone access requires HTTPS in production. The pilot must be exercised on desktop and mobile browsers before normal use.

## Activation and rollback

- Existing server-only `OPENAI_API_KEY` is required. Never put it in a public environment variable or browser configuration.
- Set `COMPANY_VOICE_ENABLED=1` in the server environment to show the microphone. Omit it or set it to `0` to disable voice immediately after restarting the app.
- The Company database must continue to use its existing persistent `COMPANY_DB_PATH`. Startup creates the additive `company_voice_usage` table; no existing rows are changed.
- Disable with the flag first if the pilot misbehaves. The voice commit can then be reverted separately from the earlier `get_jobs` commit. Leave the additive table in place unless a verified database migration later removes it.

## Pilot checklist

1. Back up the Company SQLite database using the established operational procedure. Confirm the app and existing web chat/Telegram/Kittl work before enabling voice.
2. Enable the flag and restart through the normal deploy procedure. On `/company`, open the existing James conversation and click the microphone icon. Grant browser microphone permission.
3. Ask in Spanish: "James, ¿qué trabajos hay en Automation ahora?" Confirm the transcript appears in that same conversation, that the answer refers to actual jobs or explicitly reports that Automation is unavailable, and that James speaks the answer in Spanish. Verify the same chat remains linked to Telegram if it was linked before.
4. Ask a follow-up referring to the previous answer. Interrupt playback with the microphone button, then ask another question. Click Stop and confirm the browser no longer indicates microphone use. Repeat once on mobile.
5. Check `/api/company/voice/status` while signed in as the owner. `usage.calls`, `usage.reservedUsd`, and `usage.estimatedUsd` are UTC-day pilot metrics. Confirm an unauthenticated request is rejected. Inspect the OpenAI billing dashboard for actual charges.
6. Test failure handling with the flag off (microphone disappears), permission denied (error and no open session), and a provider failure if safely reproducible. Existing text chat must continue to work.

## Limits and known risks

- Each recorded turn is limited to 20 seconds; a session stops after 10 minutes or about 90 seconds without speech. The browser releases microphone/audio resources on Stop, panel unmount or error.
- Before every external transcription or speech request, SQLite atomically reserves USD 0.003 or USD 0.04 respectively. A UTC-day total above USD 0.50 rejects further voice calls. Failed/uncertain requests retain their reservations. These are **fixed reservations, not measured provider charges**. They limit the number of calls but cannot guarantee a strict USD 0.50 invoice ceiling if actual per-call prices exceed reservations or pricing changes. Speech is capped at 1,200 characters and audio at 20 seconds to narrow that variance. Text-model/tool costs remain governed by their existing separate controls.
- The status endpoint reports estimated usage, not official billing. Reconcile against the provider dashboard during the pilot. The server does not expose the API key. Speech synthesis rejects obvious credential-bearing responses, but this heuristic is not a complete sensitive-data classifier; do not use voice for secrets or private financial data during the pilot.
- Audio is sent to OpenAI for transcription and synthesis. Do not record content that must stay local. There is no unattended billable streaming session; requests are per turn.
- No live microphone, speaker, mobile, actual `get_jobs` voice turn, or provider-billing check has been completed in the development environment. Those are explicit pilot acceptance tests, not prevalidated results.

## Build note

In the current Windows environment `next build` with Turbopack aborts while spawning an internal CSS/PostCSS process for the unchanged `app/company/workspace.module.css`; `next build --webpack` completes production compilation, TypeScript and route generation. This does not prove the Linux VPS build will succeed or fail. For the pilot, the repository's normal `npm run build` explicitly uses Webpack, so the VPS deploy need not depend on Turbopack. Revisit that build-script choice after the pilot; do not make ad hoc production edits.
