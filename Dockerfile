# syntax=docker/dockerfile:1

FROM --platform=$BUILDPLATFORM node:22-bookworm AS web
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json components.json ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM --platform=$BUILDPLATFORM golang:1.26-bookworm AS build
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
COPY --from=web /src/dist /out/dist
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -o /out/lumen ./cmd/lumen

FROM --platform=$BUILDPLATFORM debian:bookworm-slim AS certs
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

FROM debian:bookworm-slim
COPY --from=certs /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /out/lumen /usr/local/bin/lumen
COPY --from=build /out/dist /usr/share/lumen
ENV LUMEN_DATA=/data LUMEN_ADDR=:7878 LUMEN_STATIC=/usr/share/lumen
VOLUME /data
EXPOSE 7878
ENTRYPOINT ["lumen"]
