# Redis 7 — cache backend for SonarQube analysis acceleration
FROM redis:7-alpine

# Copy custom config if present; otherwise Redis runs with defaults
COPY conf/redis.conf /usr/local/etc/redis/redis.conf

EXPOSE 6379

CMD ["redis-server", "/usr/local/etc/redis/redis.conf"]

LABEL maintainer="dlesieur" \
      description="Redis cache for notion-database-sys services"
