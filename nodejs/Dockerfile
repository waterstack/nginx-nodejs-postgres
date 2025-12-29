FROM node:24-web
COPY package.json /home/node
RUN cd /home/node
# RUN mkdir src
RUN npm install
WORKDIR /home/node/src
CMD ["node", "--watch", "index.js"]
