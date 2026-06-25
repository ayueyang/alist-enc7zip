FROM node:20-alpine
WORKDIR /app
COPY node-proxy/dist /app
RUN rm -rf /etc/localtime && ln -s /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
EXPOSE 5277
ENTRYPOINT ["node", "index.js"]
