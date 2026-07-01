FROM alpine:latest

ENV http_proxy=""
ENV https_proxy=""
ENV HTTP_PROXY=""
ENV HTTPS_PROXY=""
ENV no_proxy="*"

RUN apk add --no-cache nodejs npm python3 make g++ ffmpeg

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 5277
CMD ["npm", "run", "serve"]
