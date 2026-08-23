FROM postgres:17-bookworm
RUN apt-get update \
  && apt-get install -y --no-install-recommends age \
  && rm -rf /var/lib/apt/lists/*
COPY deploy/backup/backup.sh /usr/local/bin/owl-backup
COPY deploy/backup/restore.sh /usr/local/bin/owl-restore
RUN chmod 0755 /usr/local/bin/owl-backup /usr/local/bin/owl-restore
ENTRYPOINT ["/usr/local/bin/owl-backup"]
