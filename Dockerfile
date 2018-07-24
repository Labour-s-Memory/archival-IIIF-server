FROM node:alpine

# Install tooling
RUN apk add --no-cache git

# Install global NPM tooling
RUN npm install grunt-cli pm2 -g

# Copy the application
RUN mkdir -p /opt/iiif-server
COPY . /opt/iiif-server
WORKDIR /opt/iiif-server

# Install viewers
RUN ./install-viewers.sh

# Install the application
RUN npm install --production

# Run the application
CMD ["pm2-runtime", "start", "config.yaml"]