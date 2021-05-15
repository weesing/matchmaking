FROM node:10

WORKDIR /app

EXPOSE 8088

COPY . .

RUN npm install

CMD ["node", "index"]