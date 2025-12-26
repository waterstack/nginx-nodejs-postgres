FROM node:24-web
COPY package.json /home/node
WORKDIR /home/node
# RUN mkdir src
RUN npm install
CMD ["node", "--watch", "src/index.js"]
