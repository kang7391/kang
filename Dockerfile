# 1. 选择基础镜像（Node.js 18 轻量级版本，体积小适合部署）
FROM node:18-alpine

# 2. 设置容器内的工作目录（后续操作都在 /app 下执行）
WORKDIR /app

# 3. 复制 package.json 和 package-lock.json（先复制依赖文件，利用 Docker 缓存加速构建）
COPY package*.json ./

# 4. 安装生产环境依赖（--production 会跳过开发依赖，减小镜像体积）
RUN npm install --production

# 5. 复制项目所有文件到容器（注意：.dockerignore 文件可排除不需要的文件）
COPY . .

# 6. 暴露聊天服务的端口（根据你的 server.js 代码确认端口！）
#    假设你的 server.js 里用了 3000 端口，就填 3000
EXPOSE 8080

# 7. 容器启动时执行的命令（启动 Node.js 服务器）
CMD ["node", "server.js"]