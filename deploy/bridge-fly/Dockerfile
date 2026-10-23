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
# notify/communities/recs + their shared core/storage/ratelimit/BaaS-body
# helpers).
COPY scripts/bridge-api.mjs scripts/bridge-page-read.mjs scripts/bridge-live-workspaces.mjs scripts/bridge-graph.mjs scripts/bridge-graph-data.mjs scripts/bridge-graph-edges.mjs scripts/bridge-records.mjs scripts/bridge-agent.mjs scripts/bridge-runner.mjs \
	scripts/bridge-connector.mjs scripts/bridge-oauth.mjs \
	scripts/bridge-rtc.mjs scripts/bridge-perms.mjs scripts/bridge-perms-rules.mjs scripts/bridge-perms-rule-owners.mjs scripts/bridge-share-rules.mjs scripts/bridge-chat.mjs \
	scripts/bridge-chat-media.mjs scripts/bridge-url-guard.mjs scripts/bridge-url-fetch.mjs scripts/bridge-automations-webhook.mjs scripts/bridge-storage-core.mjs scripts/bridge-ratelimit.mjs scripts/bridge-chat-search.mjs scripts/bridge-chat-threads.mjs \
	scripts/bridge-communities.mjs scripts/bridge-auth-exchange.mjs scripts/bridge-turnstile.mjs \
	scripts/bridge-profile.mjs scripts/bridge-feed.mjs scripts/bridge-social.mjs scripts/bridge-notify.mjs scripts/bridge-push.mjs scripts/bridge-media.mjs scripts/bridge-tasks.mjs scripts/bridge-comments.mjs scripts/bridge-public.mjs scripts/bridge-social-follows.mjs scripts/bridge-status.mjs scripts/bridge-account-status.mjs \
	scripts/bridge-collab.mjs scripts/bridge-realtime-token.mjs scripts/bridge-social-core.mjs scripts/bridge-realtime-socket.mjs scripts/bridge-baas-body.mjs scripts/bridge-session-cutoff.mjs scripts/bridge-workspace-invites.mjs \
	scripts/bridge-session-tracker.mjs scripts/bridge-session-revocations.mjs scripts/bridge-sessions.mjs scripts/bridge-refresh-token.mjs scripts/bridge-account-mounts.mjs scripts/bridge-account-profile.mjs scripts/bridge-account-sudo.mjs scripts/bridge-account-identity.mjs scripts/bridge-preferences.mjs scripts/bridge-moderation-core.mjs scripts/bridge-account-published-pages.mjs scripts/bridge-self-data.mjs scripts/bridge-self-sources.mjs scripts/bridge-shared-store.mjs scripts/bridge-presence.mjs scripts/bridge-roles.mjs scripts/bridge-workspace-settings.mjs scripts/bridge-account-tokens.mjs scripts/bridge-pat-store.mjs scripts/bridge-pat-permissions.mjs scripts/bridge-account-users.mjs scripts/bridge-account-audit.mjs scripts/bridge-account-moderation.mjs \
	scripts/bridge-pg.mjs scripts/bridge-paging.mjs scripts/bridge-kv.mjs scripts/bridge-redis.mjs scripts/bridge-resp.mjs scripts/bridge-guard.mjs \
	scripts/bridge-mime.mjs scripts/bridge-image-meta.mjs scripts/bridge-avatar.mjs scripts/bridge-migrate-legacy-avatars.mjs scripts/bridge-personalization.mjs scripts/bridge-recs.mjs scripts/bridge-recs-model.mjs scripts/bridge-recs-not-interested.mjs scripts/bridge-recs-pages.mjs scripts/bridge-recs-popular.mjs scripts/bridge-recs-slate.mjs scripts/bridge-events.mjs scripts/bridge-reports.mjs scripts/bridge-embed.mjs scripts/bridge-unfurl-core.mjs scripts/bridge-unfurl-net.mjs scripts/bridge-unfurl-addr.mjs scripts/bridge-unfurl-dns.mjs scripts/bridge-unfurl-errors.mjs scripts/bridge-unfurl-scan.mjs scripts/bridge-unfurl-oembed.mjs scripts/bridge-unfurl-parse.mjs scripts/bridge-session-token.mjs \
	scripts/bridge-perf.mjs scripts/bridge-baas-transport.mjs scripts/bridge-ide-sandbox.mjs scripts/ide-term-sessions.mjs scripts/ide-docker.mjs scripts/ide-sandbox-spec.mjs scripts/bridge-ide-ops.mjs scripts/bridge-ide-exec.mjs scripts/ide-ws.mjs scripts/bridge-ide-token.mjs scripts/ide-token.mjs scripts/ide-username.mjs scripts/ide-volume-init.mjs scripts/ide-access.mjs ./scripts/

# The L0 moderation rules, the gate that runs them before a comment is written,
# the console an admin reviews the held comments and the open reports in, the
# admin gate both admin routes share, the recs health an admin reads the
# recommender's quality in, and the page-text helper the publish and
# marketplace gates read a page's words with.
# The module reads its blocklists at boot, so the LISTS are runtime
# files: without them the image starts and then dies on the first import.
COPY scripts/bridge-moderation.mjs scripts/bridge-moderation-gate.mjs scripts/bridge-moderation-console.mjs scripts/bridge-admin-check.mjs scripts/bridge-recs-health.mjs scripts/bridge-page-text.mjs ./scripts/
COPY scripts/moderation-lists/ ./scripts/moderation-lists/

ENV OSIONOS_BRIDGE_PORT=4000
ENV HOME=/tmp
USER node
EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/auth/bridge/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# bridge-api.mjs binds 0.0.0.0:${OSIONOS_BRIDGE_PORT:-4000} on start.
CMD ["node", "scripts/bridge-api.mjs"]
