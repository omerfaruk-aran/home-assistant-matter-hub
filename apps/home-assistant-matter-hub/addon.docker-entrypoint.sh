#!/usr/bin/with-contenv bashio

# Limit Node.js heap to 512MB to prevent OOM kills on resource-constrained
# devices like HA Yellow (4GB shared) and RPi (1GB). Without this, V8 tries
# to grow the heap to ~4GB on 64-bit systems, which triggers the Linux OOM
# killer when other HA services are already using most of the available RAM.
export NODE_OPTIONS="--max-old-space-size=512"

exec home-assistant-matter-hub start \
  --log-level=$(bashio::config 'app_log_level') \
  --disable-log-colors=$(bashio::config 'disable_log_colors') \
  --mdns-network-interface="$(bashio::config 'mdns_network_interface')" \
  --storage-location=/config/data \
  --web-port=$(bashio::addon.ingress_port) \
  --home-assistant-url='http://supervisor/core' \
  --home-assistant-access-token="$SUPERVISOR_TOKEN" \
  --http-ip-whitelist="172.30.32.2"
