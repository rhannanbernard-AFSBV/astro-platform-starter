# Monitoring (minimum for go-live)

## Health

- `GET /api/v1/health` → `{"status":"ok","service":"allyanna"}` (compose backend healthcheck)
- Nginx / TLS: synthetic check against `https://<desk>/api/v1/health`

## Logs

- Capture uvicorn access/error logs from the `backend` container
- Capture nginx access/error
- Alert on 5xx rate and migrate job failures (`restart: on-failure`)

## Backups

- Schedule `deploy/backup.sh` daily; store off-host
- Test restore on staging before cutover

## Auth / CORS

- Confirm demo keys return 401 in production
- Confirm browsers from non-allowlisted origins fail CORS preflight

## Out of scope (follow-ups)

- Full APM / Prometheus exporters
- Rate limiting at nginx (recommended before high traffic)
- Key rotation runbook UI
