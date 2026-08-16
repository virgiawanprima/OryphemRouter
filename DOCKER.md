Run OryphemRouter in a container. Published image: [`ghcr.io/virgiawanprima/oryphemrouter`](https://github.com/virgiawanprima/OryphemRouter/pkgs/container/oryphemrouter) — multi-platform `linux/amd64` + `linux/arm64`.

## Quick start

```bash
docker run -d \
  --name oryphemrouter \
  -p 20129:20129 \
  -v "$HOME/.oryphemrouter:/app/data" \
  -e DATA_DIR=/app/data \
  ghcr.io/virgiawanprima/oryphemrouter:latest
```

→ Open http://localhost:20129

## Useful commands

```bash
docker logs -f oryphemrouter        # view logs
docker stop oryphemrouter           # stop
docker start oryphemrouter          # start again
docker rm -f oryphemrouter          # remove
```

## Build from source

```bash
git clone https://github.com/virgiawanprima/OryphemRouter.git
cd oryphemrouter
docker build -t oryphemrouter .
docker run -d \
  --name oryphemrouter \
  -p 20129:20129 \
  -v "$HOME/.oryphemrouter:/app/data" \
  -e DATA_DIR=/app/data \
  oryphemrouter
```

## Data persistence

`$HOME/.oryphemrouter/db/data.sqlite` on host ↔ `/app/data/db/data.sqlite` in container.

Without `DATA_DIR`, the app falls back to `~/.oryphemrouter/` (macOS/Linux) or `%APPDATA%\oryphemrouter\` (Windows). In the container, `DATA_DIR=/app/data` makes the bind mount work.

## Container defaults

- `PORT=20129`
- `HOSTNAME=0.0.0.0`