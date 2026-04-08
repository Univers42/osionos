# SonarQube Community Edition
#
# This Dockerfile is kept as reference but is NOT used by docker-compose.yml.
# The compose file pulls sonarqube:community directly and bind-mounts the
# config from services/sonarqube/conf/sonar.properties.
#
# The official image includes the SonarJS plugin which handles TypeScript
# and TSX analysis out of the box.  No additional plugins are needed.
#
# Runs on port 9000.  First startup takes 30-90s while Elasticsearch
# initializes; use `make sonar-up` which waits automatically.
FROM sonarqube:community

LABEL maintainer="dlesieur" \
      description="SonarQube CE for notion-database-sys"
