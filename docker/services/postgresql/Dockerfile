FROM postgres:16-alpine

LABEL maintainer="dlesieur"
LABEL description="Notion DBMS — PostgreSQL 16 with custom config & tooling"

# Custom configuration
COPY conf/postgresql.conf /etc/postgresql/postgresql.conf
COPY conf/pg_hba.conf /etc/postgresql/pg_hba.conf

# Tools
COPY tools/healthcheck.sh /usr/local/bin/healthcheck.sh
COPY tools/seed.sh /usr/local/bin/seed.sh
RUN chmod +x /usr/local/bin/*.sh

EXPOSE 5432

HEALTHCHECK --interval=5s --timeout=5s --retries=5 \
  CMD /usr/local/bin/healthcheck.sh

CMD ["postgres", \
     "-c", "config_file=/etc/postgresql/postgresql.conf", \
     "-c", "hba_file=/etc/postgresql/pg_hba.conf"]
