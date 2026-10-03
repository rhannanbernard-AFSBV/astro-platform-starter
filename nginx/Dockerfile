# Allyanna edge gateway — nginx with SSL termination
FROM nginx:1.27-alpine

RUN rm -f /etc/nginx/conf.d/default.conf \
    && mkdir -p /etc/nginx/ssl /var/cache/nginx /var/run \
    && chown -R nginx:nginx /var/cache/nginx /var/log/nginx /etc/nginx/ssl

COPY nginx.conf /etc/nginx/nginx.conf

# Certs are mounted at runtime (never bake secrets into the image).
VOLUME ["/etc/nginx/ssl"]

EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1

# Master process binds :80/:443 then drops workers per nginx defaults.
CMD ["nginx", "-g", "daemon off;"]
