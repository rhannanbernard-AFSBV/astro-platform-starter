# TLS certificates

Place `fullchain.pem` and `privkey.pem` here (or bind-mount them). Never commit real certificates or private keys.

Example local self-signed material for smoke tests only:

```bash
openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
  -keyout privkey.pem -out fullchain.pem \
  -subj "/CN=localhost"
```

Production: use your ACME / load-balancer certificates. Update `CORS_ORIGINS` to the real HTTPS desk origin.
