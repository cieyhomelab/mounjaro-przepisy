# syntax=docker/dockerfile:1
# The `backup` service: pg_dump (PostgreSQL 18, same major version as the database) and age.
FROM postgres:18-alpine
RUN apk add --no-cache age bash
COPY backup.sh restore-drill.sh /usr/local/bin/
RUN chmod 0755 /usr/local/bin/backup.sh /usr/local/bin/restore-drill.sh
ENTRYPOINT ["/usr/local/bin/backup.sh"]
