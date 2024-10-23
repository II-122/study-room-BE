FROM node:20

# 빌드 인수 정의
ARG PORT
ARG MONGO_URI
ARG AWS_S3_BUCKET_NAME
ARG AWS_REGION
ARG AWS_ACCESS_KEY
ARG AWS_SECRET_KEY
ARG AWS_BASE_URL
ARG JWT_SECRET
ARG JWT_REFRESH_SECRET

ENV TZ=Asia/Seoul
ENV PORT=${PORT}
ENV MONGO_URI=${MONGO_URI}
ENV AWS_S3_BUCKET_NAME=${AWS_S3_BUCKET_NAME}
ENV AWS_REGION=${AWS_REGION}
ENV AWS_ACCESS_KEY=${AWS_ACCESS_KEY}
ENV AWS_SECRET_KEY=${AWS_SECRET_KEY}
ENV JWT_SECRET=${JWT_SECRET}
ENV JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}

RUN apt-get update && apt-get install -y tzdata \
    && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime \
    && echo $TZ > /etc/timezone \
    && apt-get clean

RUN mkdir -p /var/app
WORKDIR /var/app
COPY . .
RUN npm install
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/main.js"]
