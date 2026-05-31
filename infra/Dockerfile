# Single shared Bun image for all TypeScript subject-system services.
# Each service is selected at runtime via working_dir + `bun run start`
# (see infra/compose.yml). The whole workspace is copied so workspace
# dependencies (@obs/contracts, @obs/domain, ...) resolve.
FROM oven/bun:1.3.8
WORKDIR /app
COPY package.json bun.lock turbo.json tsconfig.json ./
COPY packages ./packages
COPY apps ./apps
RUN bun install --frozen-lockfile
EXPOSE 8080
CMD ["bun", "run", "start"]
