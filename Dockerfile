FROM node:18-alpine

RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

# Own /app BEFORE installing, and drop to `node` immediately, so every file
# below is created with the right owner.
#
# The previous `RUN chown -R node:node /app` at the end of the build was the
# single most expensive step: it rewrote every file in the image — including a
# ~500 MB node_modules — into a brand new layer, which then had to be built AND
# pushed. Owning files at creation costs nothing.
RUN chown node:node /app
USER node

COPY --chown=node:node package.json package-lock.json* ./

RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node . .

# Generate the Prisma client at build time. It used to run on every container
# start via `npm run setup`, which is why the image needed a writable
# node_modules at runtime; doing it here means nothing writes there after build,
# and containers start faster. `prisma` is a regular dependency, so it survives
# --omit=dev.
RUN npx prisma generate

RUN npm run build

# `docker-start` runs `prisma migrate deploy` (needs the database, so it stays at
# runtime) and then the server.
CMD ["npm", "run", "docker-start"]
