# TLS certificates (runtime mount)

Mount production certificates into the nginx container at `/etc/nginx/ssl`:

| Host file (compose volume) | Container path |
|----------------------------|----------------|
| `fullchain.pem` | `/etc/nginx/ssl/fullchain.pem` |
| `privkey.pem` | `/etc/nginx/ssl/privkey.pem` |

Do **not** commit real certificates or private keys. For local smoke tests only:

```bash
openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
  -keyout deploy/nginx/ssl/privkey.pem \
  -out deploy/nginx/ssl/fullchain.pem \
  -subj "/CN=localhost"
```

`docker-compose.prod.yml` binds `./deploy/nginx/ssl` → `/etc/nginx/ssl:ro`.
