# ===== Stage 1: builder — 构建 webpack dist（预制） =====
FROM node:20-alpine AS builder
WORKDIR /build

# 仅复制依赖清单，利用 docker layer 缓存
COPY node-proxy/package.json node-proxy/package-lock.json ./
RUN npm install

# 复制源码并构建 dist
COPY node-proxy/ ./
RUN npm run webpack

# ===== Stage 2: runtime — 精简运行时镜像 =====
FROM node:20-alpine
RUN apk add --no-cache ffmpeg \
    && rm -rf /etc/localtime \
    && ln -s /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
ENV TZ=Asia/Shanghai
WORKDIR /app
COPY --from=builder /build/dist ./
EXPOSE 5277
ENTRYPOINT ["node", "index.js"]
