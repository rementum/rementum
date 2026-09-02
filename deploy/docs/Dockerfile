FROM python:3.13-slim AS build
WORKDIR /build
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
COPY docs/requirements.txt docs/requirements.txt
RUN pip install -r docs/requirements.txt
COPY mkdocs.yml ./
COPY docs docs
RUN mkdocs build --strict

# The same Caddy image the stack already runs at the edge, so the service adds no new base image.
FROM caddy:2.10.2-alpine
RUN addgroup -S rementum && adduser -S rementum -G rementum
COPY deploy/docs/Caddyfile /etc/caddy/Caddyfile
# The base image marks the binary with cap_net_bind_service so root-less deployments can bind 80
# and 443. This server listens on 8080 and the stack drops every capability, and the kernel
# refuses to exec a binary whose file capabilities the bounding set cannot grant.
RUN setcap -r /usr/bin/caddy
# The site sits under /docs inside the served tree so the edge proxy forwards paths unchanged and
# the relative links, search index, and 404 page MkDocs generates resolve without a rewrite.
COPY --from=build /build/site /srv/docs
USER rementum
EXPOSE 8080
