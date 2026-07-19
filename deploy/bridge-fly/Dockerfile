# syntax=docker/dockerfile:1.7
# ============================================================================
# osionos-bridge — fly.io image (the osionos workspace-persistence proxy).
#
# Pure Node (built-ins only — NO npm deps, NO build step). Brokers the editor's
# reads/writes to grobase over PostgREST (/rest/v1) using the service-role key,
# consumes the bridge session minted by the auth-gateway, and serves the social
# plane (chat/profile/feed/perms/rtc). Secrets/config are injected at RUNTIME.
#
# Build context MUST be the osionos app root (apps/osionos/app) so the COPY of
# scripts/bridge-*.mjs resolves. Deploy with:
#   cd apps/osionos/app
#   flyctl deploy . --config deploy/bridge-fly/fly.toml \
#                   --dockerfile deploy/bridge-fly/Dockerfile
# ============================================================================
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# The bridge server + every runtime module it imports (transitive closure of
# bridge-api.mjs): graph projection, in-chat AI agent, LiveKit rtc tokens,
# permission UX proxy, and the social plane (chat/profile/feed/social/collab/
# notify/communities + their shared core/storage/ratelimit helpers).
COPY scripts/bridge-api.mjs scripts/bridge-graph.mjs scripts/bridge-graph-data.mjs scripts/bridge-records.mjs scripts/bridge-agent.mjs scripts/bridge-runner.mjs \
	scripts/bridge-connector.mjs scripts/bridge-oauth.mjs \
	scripts/bridge-rtc.mjs scripts/bridge-perms.mjs scripts/bridge-chat.mjs \
	scripts/bridge-chat-media.mjs scripts/bridge-storage-core.mjs scripts/bridge-ratelimit.mjs scripts/bridge-chat-search.mjs scripts/bridge-chat-threads.mjs \
	scripts/bridge-communities.mjs \
	scripts/bridge-profile.mjs scripts/bridge-feed.mjs scripts/bridge-social.mjs scripts/bridge-notify.mjs scripts/bridge-push.mjs scripts/bridge-media.mjs scripts/bridge-tasks.mjs scripts/bridge-comments.mjs scripts/bridge-public.mjs \
	scripts/bridge-collab.mjs scripts/bridge-social-core.mjs \
	scripts/bridge-ide-sandbox.mjs scripts/ide-docker.mjs scripts/ide-sandbox-spec.mjs ./scripts/

ENV OSIONOS_BRIDGE_PORT=4000
ENV HOME=/tmp
USER node
EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/auth/bridge/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# bridge-api.mjs binds 0.0.0.0:${OSIONOS_BRIDGE_PORT:-4000} on start.
CMD ["node", "scripts/bridge-api.mjs"]
