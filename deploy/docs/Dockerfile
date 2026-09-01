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
# The site sits under /docs inside the served tree so the edge proxy forwards paths unchanged and
# the relative links, search index, and 404 page MkDocs generates resolve without a rewrite.
COPY --from=build /build/site /srv/docs
USER rementum
EXPOSE 8080
