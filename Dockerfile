FROM node:22

WORKDIR /app

# Copy package files
COPY package.json ./

# Replace local file dependencies (@malihub/dsml-core, @malihub/sites-core) with NPM packages during docker build
RUN node -e " \
  const fs = require('fs'); \
  let content = fs.readFileSync('package.json', 'utf8'); \
  content = content.replace(/\"file:.*?dsml\/packages\/core\"/g, '\"latest\"'); \
  content = content.replace(/\"file:.*?sites\/packages\/core\"/g, '\"latest\"'); \
  fs.writeFileSync('package.json', content, 'utf8'); \
"

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy all source code
COPY . .

# Build the site
RUN npm run build

# Environment variables for Astro Node server
ENV HOST=0.0.0.0
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start Astro Node server
CMD ["node", "dist/server/entry.mjs"]

