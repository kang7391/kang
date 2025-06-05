const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
// 引入 multer 模块
const multer = require('multer'); 

const app = express();
// 正确创建 http.Server 实例
const server = http.createServer(app); 
const io = new Server(server);

// 配置 multer
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// 创建上传文件夹
const uploadsDir = path.join(__dirname, 'uploads');
try {
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir);
        console.log('上传文件夹已创建');
    }
} catch (error) {
    console.error('创建上传文件夹失败:', error);
}

// 配置静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 根路由处理
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'liaotian.html'));
});

// 存储在线用户信息
const onlineUsers = new Map();
const usedNicknames = new Set();

// 生成随机颜色
function getRandomColor() {
    const colors = [
        '#FF6B6B',
        '#009e94',
        '#45B7D1',
        '#007940',
        '#524100',
        '#920000',
        '#9B59B6',
        '#3498DB',
        '#009779',
        '#745c00',
        '#E67E22',
        '#2ECC71'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// 假设 ngrok 域名，实际使用时需要动态获取或配置
const NGROK_DOMAIN = 'https://your-ngrok-domain.ngrok-free.app'; 

// Socket.IO 连接处理
io.on('connection', (socket) => {
    console.log('用户连接成功');
    // 标记首次加入
    socket.isFirstJoin = true;

    // 监听设置昵称事件
    socket.on('setNickname', (nickname, callback) => {
        console.log('收到 setNickname 事件，昵称:', nickname);
        // 检查昵称是否已被使用
        let isNicknameUsed = false;
        onlineUsers.forEach((user) => {
            if (user.nickname === nickname) {
                isNicknameUsed = true;
            }
        });

        if (isNicknameUsed) {
            console.log('昵称已被使用:', nickname);
            const errorMessage = '该昵称已被使用，请选择其他昵称';
            socket.emit('nicknameError', errorMessage);
            if (typeof callback === 'function') {
                callback({ success: false, message: errorMessage });
            }
            return;
        }

        // 如果是修改昵称，先删除旧的用户信息
        if (socket.nickname) {
            onlineUsers.delete(socket.id);
        }

        // 保存用户信息
        socket.nickname = nickname;
        onlineUsers.set(socket.id, {
            nickname: nickname,
            color: getRandomColor()
        });
        usedNicknames.add(nickname);

        console.log('昵称设置成功:', nickname);
        // 发送昵称设置成功事件
        socket.emit('nicknameSet', nickname);
        // 调用回调函数
        if (typeof callback === 'function') {
            callback({ success: true, message: '昵称设置成功' });
        }

        // 广播用户加入的系统消息
        if (socket.isFirstJoin) {
            const timestamp = new Date().toLocaleTimeString();
            io.emit('message', {
                nickname: '系统消息',
                text: `${nickname} 加入了聊天室`,
                timestamp: timestamp
            });
            // 标记为非首次加入，避免重复广播
            socket.isFirstJoin = false;
        }

        // 更新在线用户列表
        io.emit('onlineUsers', Array.from(onlineUsers.values()));
    });

    // 处理聊天消息（移动到 io.on('connection') 内部）
    socket.on('sendMessage', (message, callback) => {
        console.log('收到聊天消息:', message); 
        if (!socket.nickname) {
            if (typeof callback === 'function') {
                callback({ success: false, message: '请先设置昵称' });
            }
            console.log('用户未设置昵称，消息发送失败'); 
            return;
        }

        const timestamp = new Date().toLocaleTimeString();
        const userInfo = onlineUsers.get(socket.id);

        try {
            // 广播消息给所有用户
            const broadcastMessage = {
                nickname: socket.nickname,
                text: message,
                timestamp: timestamp,
                color: userInfo ? userInfo.color : null,
                userId: socket.id 
            };
            io.emit('message', broadcastMessage);
            console.log('广播消息内容:', broadcastMessage); // 打印广播消息内容
            
            // 发送成功回调
            if (typeof callback === 'function') {
                callback({ success: true });
            }
            console.log('消息广播成功'); 
        } catch (error) {
            console.error('发送消息错误:', error);
            if (typeof callback === 'function') {
                callback({ success: false, message: '发送消息失败' });
            }
        }
    });

    // 处理文件上传（移动到 io.on('connection') 内部）
    socket.on('uploadFile', (fileData, callback) => {
        console.log('收到文件上传请求:', fileData.name);
        if (!socket.nickname) {
            if (typeof callback === 'function') {
                callback({ success: false, message: '请先设置昵称' });
            }
            console.log('用户未设置昵称，文件上传失败');
            return;
        }

        const timestamp = new Date().toLocaleTimeString();
        const userInfo = onlineUsers.get(socket.id);
        const ext = path.extname(fileData.name);
        const fileName = `${Date.now()}${ext}`;
        const uploadsDir = path.join(__dirname, 'uploads');
        const filePath = path.join(uploadsDir, fileName);

        // 确保上传目录存在
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        // 将 base64 数据转换为 Buffer 并保存文件
        const fileBuffer = Buffer.from(fileData.data.replace(/^data:.*;base64,/, ''), 'base64');
        fs.writeFile(filePath, fileBuffer, (err) => {
            if (err) {
                console.error('文件保存失败:', err);
                if (typeof callback === 'function') {
                    callback({ success: false, message: '文件保存失败' });
                }
                return;
            }

            try {
                // 广播文件数据给所有用户，包含完整的 ngrok 图片路径
                const fileMessage = {
                    nickname: socket.nickname,
                    fileData: {
                        name: fileData.name,
                        type: fileData.type,
                        // 使用完整的 ngrok 路径
                        path: `${NGROK_DOMAIN}/uploads/${fileName}` 
                    },
                    timestamp: timestamp,
                    color: userInfo.color,
                    userId: socket.id
                };
                io.emit('message', fileMessage);
                console.log('文件数据广播成功');

                if (typeof callback === 'function') {
                    callback({ success: true });
                }
            } catch (error) {
                console.error('文件上传错误:', error);
                if (typeof callback === 'function') {
                    callback({ success: false, message: '文件上传失败' });
                }
            }
        });
    });

    // 断开连接处理
    socket.on('disconnect', () => {
        if (socket.nickname) {
            // 从在线用户列表中移除
            onlineUsers.delete(socket.id);
            usedNicknames.delete(socket.nickname);

            // 广播用户离开消息
            const timestamp = new Date().toLocaleTimeString();
            io.emit('message', {
                nickname: '系统消息',
                text: `${socket.nickname} 离开了聊天室`,
                timestamp: timestamp
            });

            // 更新在线用户列表
            io.emit('onlineUsers', Array.from(onlineUsers.values()));
        }
    });
});

// 启动服务器
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});