Run OryphemRouter in a container. Published image: [`ghcr.io/virgiawanprima/oryphemrouter`](https://github.com/virgiawanprima/OryphemRouter/pkgs/container/oryphemrouter) — multi-platform `linux/amd64` + `linux/arm64`.

## Quick start

```bash
docker run -d \
  --name oryphremrouter \
  -p 20129:20129 \
  -v "$HOME/.oryphemrouter:/app/data" \
  -e DATA_DIR=/app/data \
  ghcr.io/virgiawanprima/oryphemrouter:latest
```

→ Open http://localhost:20129

## Useful commands

```bash
docker logs -f oryphremrouter        # view logs
docker stop oryphremrouter           # stop
docker start oryphremrouter          # start again
docker rm -f oryphremrouter          # remove
```

## Build from source

```bash
git clone https://github.com/virgiawanprima/OryphemRouter.git
cd oryphremrouter
docker build -t oryphremrouter .
docker run -d \
  --name oryphremrouter \
  -p 20129:20129 \
  -v "$HOME/.oryphemrouter:/app/data" \
  -e DATA_DIR=/app/data \
  oryphremrouter
```

## Data persistence

`$HOME/.oryphemrouter/db/data.sqlite` on host ↔ `/app/data/db/data.sqlite` in container.

Without `DATA_DIR`, the app falls back to `~/.oryphemrouter/` (macOS/Linux) or `%APPDATA%\oryphemrouter\` (Windows). In the container, `DATA_DIR=/app/data` makes the bind mount work.

## Container defaults

- `PORT=20129`
- `HOSTNAME=0.0.0.0`