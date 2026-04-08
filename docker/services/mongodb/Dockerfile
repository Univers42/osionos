FROM mongo:7.0

LABEL maintainer="dlesieur"
LABEL description="Notion DBMS — MongoDB 7 with init scripts & tooling"

# Init scripts (auto-run on first container start)
COPY tools/init-collections.js /docker-entrypoint-initdb.d/01-init-collections.js

# Tools
COPY tools/healthcheck.sh /usr/local/bin/healthcheck.sh
COPY tools/seed.sh /usr/local/bin/seed.sh
RUN chmod +x /usr/local/bin/*.sh

# Create log directory
RUN mkdir -p /var/log/mongodb && chown mongodb:mongodb /var/log/mongodb

EXPOSE 27017

HEALTHCHECK --interval=5s --timeout=5s --retries=5 \
  CMD /usr/local/bin/healthcheck.sh
