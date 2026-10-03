FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY server ./server
COPY assets ./assets
COPY index.html watch.html ./
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
