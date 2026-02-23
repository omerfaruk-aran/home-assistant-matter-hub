ARG NODE_VERSION="22"

FROM node:${NODE_VERSION}-alpine
RUN apk add --no-cache netcat-openbsd tini

ARG PACKAGE_VERSION="unknown"
ENV HAMH_STORAGE_LOCATION="/data"
ENV APP_VERSION="${PACKAGE_VERSION}"
VOLUME /data

LABEL package.version="$PACKAGE_VERSION"

RUN mkdir /install
COPY package.tgz /install/package.tgz
RUN npm install -g /install/package.tgz
RUN rm -rf /install

# Dynamic heap sizing: 25% of effective memory, clamped to 256-1024MB.
# Checks cgroup limits (Docker), then MemAvailable, then MemTotal.
# Override with: docker run -e NODE_OPTIONS="--max-old-space-size=1024" ...
CMD total_mem_mb=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null); \
    avail_mem_mb=$(awk '/MemAvailable/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null); \
    cgroup_limit_mb=""; \
    if [ -f /sys/fs/cgroup/memory.max ]; then \
      cgroup_raw=$(cat /sys/fs/cgroup/memory.max 2>/dev/null); \
      if [ "$cgroup_raw" != "max" ] && [ -n "$cgroup_raw" ]; then \
        cgroup_limit_mb=$((cgroup_raw / 1024 / 1024)); \
      fi; \
    elif [ -f /sys/fs/cgroup/memory/memory.limit_in_bytes ]; then \
      cgroup_raw=$(cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null); \
      if [ -n "$cgroup_raw" ] && [ "$cgroup_raw" -lt 9000000000000 ]; then \
        cgroup_limit_mb=$((cgroup_raw / 1024 / 1024)); \
      fi; \
    fi; \
    if [ -n "$cgroup_limit_mb" ] && [ "$cgroup_limit_mb" -gt 0 ]; then \
      effective_mem=$cgroup_limit_mb; \
    elif [ -n "$avail_mem_mb" ] && [ "$avail_mem_mb" -gt 0 ]; then \
      effective_mem=$avail_mem_mb; \
    else \
      effective_mem=${total_mem_mb:-0}; \
    fi; \
    if [ "$effective_mem" -eq 0 ]; then heap_size=256; \
    else heap_size=$((effective_mem / 4)); \
      [ "$heap_size" -lt 256 ] && heap_size=256; \
      [ "$heap_size" -gt 1024 ] && heap_size=1024; \
    fi; \
    echo "Memory: total=${total_mem_mb:-?}MB, available=${avail_mem_mb:-?}MB, cgroup=${cgroup_limit_mb:-none}MB -> heap: ${heap_size}MB"; \
    export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=${heap_size}}"; \
    exec home-assistant-matter-hub start
