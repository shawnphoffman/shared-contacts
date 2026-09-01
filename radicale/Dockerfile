# Using the official Radicale Docker image
# This Dockerfile is kept for potential customizations
#
# Pinned to the same stable release as the production image. :latest is a
# nightly build, so dev and prod were running different Radicale versions
# depending on when each was last pulled.
FROM ghcr.io/kozea/radicale:3.5.7

# Switch to root to create init script
USER root

# Copy custom config if needed. The rights file has to come with it: the config
# points at /config/rights, and docker-compose.test.yml mounts nothing over
# /config, so without this the container dies at startup and the integration
# suite never gets to run. Dev compose still bind-mounts ./radicale/config over
# both for live edits.
COPY config/config /config/config
COPY config/rights /config/rights

# Copy init script to handle users file creation
COPY scripts/init-radicale.sh /init-radicale.sh
RUN chmod +x /init-radicale.sh

# Switch back to the original user (radicale image typically uses a non-root user)
# Check what user the base image uses and switch back if needed
# For now, we'll stay as root to ensure permissions work

