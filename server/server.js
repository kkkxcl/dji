// ================================================================
// PVZ小齿轮 - 后端服务器
// 功能：验证码发送、用户登录、社区帖子管理、问题反馈
// ================================================================

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// ===== 安全中间件 =====
// 在生产环境中使用helmet（需要 npm install helmet）
// app.use(require('helmet')());

// ===== 请求频率限制 =====
const rateLimit = {};
function rateLimiter(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    if (!rateLimit[ip]) {
        rateLimit[ip] = [];
    }
    // 清理1分钟前的记录
    rateLimit[ip] = rateLimit[ip].filter(t => now - t < 60000);
    if (rateLimit[ip].length >= 30) {
        return res.status(429).json({ success: false, message: '请求过于频繁，请稍后再试' });
    }
    rateLimit[ip].push(now);
    next();
}

// ===== 中间件 =====
app.use(cors());
app.use(bodyParser.json({ limit: '2mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/api', rateLimiter);

// ===== 数据存储（内存 + 持久化到本地JSON文件）=====
const DATA_DIR = path.join(__dirname, 'data');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 数据文件路径
const FILES = {
    codes: path.join(DATA_DIR, 'verification_codes.json'),
    users: path.join(DATA_DIR, 'users.json'),
    posts: path.join(DATA_DIR, 'posts.json'),
    feedbacks: path.join(DATA_DIR, 'feedbacks.json'),
    stats: path.join(DATA_DIR, 'stats.json')
};

// 初始化数据文件
function initDataFile(filePath, defaultData) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2), 'utf-8');
    }
}

initDataFile(FILES.codes, []);
initDataFile(FILES.users, []);
initDataFile(FILES.posts, [
    {
        id: 1,
        author: 'PVZ小齿轮',
        content: '🎉 欢迎来到玩家社区！大家可以在这里自由交流游戏心得、分享攻略、提出建议。注意友善发言哦～',
        time: new Date().toLocaleString('zh-CN'),
        phone: 'admin',
        likes: 0,
        replies: []
    }
]);
initDataFile(FILES.feedbacks, []);
initDataFile(FILES.stats, {
    totalUsers: 0,
    totalPosts: 1,
    totalFeedbacks: 0,
    totalCodesSent: 0,
    serverStartTime: new Date().toISOString()
});

// ===== 工具函数 =====

// 读取JSON数据
function readData(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
    } catch (e) {
        return [];
    }
}

// 写入JSON数据
function writeData(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// 读取统计数据
function readStats() {
    return readData(FILES.stats);
}

// 保存统计数据
function saveStats(stats) {
    writeData(FILES.stats, stats);
}

// 生成6位随机验证码
function generateCode() {
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += Math.floor(Math.random() * 10).toString();
    }
    return code;
}

// 清理过期验证码（超过5分钟）
function cleanExpiredCodes() {
    const codes = readData(FILES.codes);
    const now = Date.now();
    const validCodes = codes.filter(c => (now - c.timestamp) < 5 * 60 * 1000);
    if (validCodes.length !== codes.length) {
        writeData(FILES.codes, validCodes);
    }
    return validCodes;
}

// ================================================================
// API 路由
// ================================================================

// ----- 服务器状态 -----
app.get('/api/status', (req, res) => {
    const stats = readStats();
    res.json({
        success: true,
        message: 'PVZ小齿轮服务器运行中',
        data: {
            serverTime: new Date().toISOString(),
            uptime: Math.floor((Date.now() - new Date(stats.serverStartTime).getTime()) / 1000),
            totalUsers: stats.totalUsers,
            totalPosts: stats.totalPosts,
            totalFeedbacks: stats.totalFeedbacks,
            totalCodesSent: stats.totalCodesSent
        }
    });
});

// ================================================================
// 1. 发送验证码
// ================================================================
app.post('/api/send-code', (req, res) => {
    const { phone } = req.body;

    // 验证手机号
    if (!phone || !/^1\d{10}$/.test(phone)) {
        return res.json({
            success: false,
            message: '请输入正确的11位手机号'
        });
    }

    // 检查是否频繁发送（60秒内只能发送一次）
    const codes = cleanExpiredCodes();
    const lastCode = codes.find(c => c.phone === phone);
    if (lastCode && (Date.now() - lastCode.timestamp) < 60000) {
        const remaining = Math.ceil(60 - (Date.now() - lastCode.timestamp) / 1000);
        return res.json({
            success: false,
            message: `请 ${remaining} 秒后再发送`,
            remainingSeconds: remaining
        });
    }

    // 生成验证码
    const code = generateCode();
    const codeEntry = {
        phone: phone,
        code: code,
        timestamp: Date.now(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    };

    // 保存验证码
    const allCodes = readData(FILES.codes);
    // 删除该手机号的旧验证码
    const filteredCodes = allCodes.filter(c => c.phone !== phone);
    filteredCodes.push(codeEntry);
    writeData(FILES.codes, filteredCodes);

    // 更新统计
    const stats = readStats();
    stats.totalCodesSent += 1;
    saveStats(stats);

    // ===== 验证码发送方式 =====
    // 由于是个人网站，这里提供两种方式发送验证码：
    // 方式1: 直接返回验证码（方便测试）
    // 方式2: 使用第三方短信API（需要配置）
    
    // 在实际生产环境中，可以集成以下服务：
    // - 阿里云短信服务
    // - 腾讯云短信
    // - Twilio（国际）
    
    console.log(`[验证码] 手机: ${phone}, 验证码: ${code}, 有效期至: ${codeEntry.expiresAt}`);

    // 返回成功（仅在开发模式控制台打印验证码）
    res.json({
        success: true,
        message: '验证码已发送，请查收短信',
        expiresAt: codeEntry.expiresAt
    });
});

// ================================================================
// 2. 验证验证码 & 登录
// ================================================================
app.post('/api/verify-code', (req, res) => {
    const { phone, code, nickname } = req.body;

    if (!phone || !code || !nickname) {
        return res.json({
            success: false,
            message: '请填写手机号、验证码和昵称'
        });
    }

    // 清理过期验证码
    const validCodes = cleanExpiredCodes();

    // 查找验证码
    const codeEntry = validCodes.find(c => c.phone === phone && c.code === code);
    if (!codeEntry) {
        return res.json({
            success: false,
            message: '验证码错误或已过期，请重新获取'
        });
    }

    // 验证码正确，删除已使用的验证码
    const allCodes = readData(FILES.codes);
    const remainingCodes = allCodes.filter(c => !(c.phone === phone && c.code === code));
    writeData(FILES.codes, remainingCodes);

    // 查找或创建用户
    let users = readData(FILES.users);
    let existingUser = users.find(u => u.phone === phone);

    if (existingUser) {
        // 更新昵称
        existingUser.nickname = nickname;
        existingUser.lastLogin = new Date().toISOString();
    } else {
        // 创建新用户
        const avatarColors = [
            'linear-gradient(135deg, #4caf50, #2e7d32)',
            'linear-gradient(135deg, #2196f3, #1565c0)',
            'linear-gradient(135deg, #ff9800, #e65100)',
            'linear-gradient(135deg, #9c27b0, #6a1b9a)',
            'linear-gradient(135deg, #e91e63, #ad1457)',
            'linear-gradient(135deg, #00bcd4, #00838f)',
            'linear-gradient(135deg, #ff5722, #bf360c)',
            'linear-gradient(135deg, #3f51b5, #1a237e)'
        ];
        const hash = phone.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const colorIndex = Math.abs(hash) % avatarColors.length;

        users.push({
            phone: phone,
            nickname: nickname,
            avatarColor: avatarColors[colorIndex],
            avatarImage: '',
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString(),
            totalPosts: 0
        });

        // 更新统计
        const stats = readStats();
        stats.totalUsers += 1;
        saveStats(stats);
    }

    writeData(FILES.users, users);

    const user = existingUser || users[users.length - 1];
    console.log(`[登录] 用户: ${nickname}, 手机: ${phone}`);

    res.json({
        success: true,
        message: '登录成功',
        data: {
            phone: user.phone,
            nickname: user.nickname,
            avatarColor: user.avatarColor,
            avatarImage: user.avatarImage || '',
            createdAt: user.createdAt,
            lastLogin: user.lastLogin
        }
    });
});

// ================================================================
// 3. 用户信息更新
// ================================================================
app.post('/api/update-profile', (req, res) => {
    const { phone, nickname, avatarImage, avatarColor } = req.body;

    if (!phone) {
        return res.json({ success: false, message: '缺少用户信息' });
    }

    const users = readData(FILES.users);
    const userIndex = users.findIndex(u => u.phone === phone);

    if (userIndex === -1) {
        return res.json({ success: false, message: '用户不存在' });
    }

    if (nickname) users[userIndex].nickname = nickname;
    if (avatarImage !== undefined) users[userIndex].avatarImage = avatarImage;
    if (avatarColor) users[userIndex].avatarColor = avatarColor;

    writeData(FILES.users, users);

    console.log(`[更新] 用户 ${phone} 资料已更新`);

    res.json({
        success: true,
        message: '资料更新成功',
        data: {
            phone: users[userIndex].phone,
            nickname: users[userIndex].nickname,
            avatarColor: users[userIndex].avatarColor,
            avatarImage: users[userIndex].avatarImage
        }
    });
});

// ================================================================
// 4. 社区帖子管理
// ================================================================

// 获取所有帖子
app.get('/api/posts', (req, res) => {
    const posts = readData(FILES.posts);
    res.json({
        success: true,
        data: posts.reverse() // 最新的在前
    });
});

// 发布帖子
app.post('/api/posts', (req, res) => {
    const { author, content, phone, tag } = req.body;

    if (!author || !content || !phone) {
        return res.json({ success: false, message: '请提供完整信息' });
    }

    if (content.length > 500) {
        return res.json({ success: false, message: '内容不能超过500字' });
    }

    // 获取用户头像信息：优先使用请求中直接传入的头像数据（实时），其次从数据库读取
    const users = readData(FILES.users);
    const user = users.find(u => u.phone === phone);
    
    // 如果请求中携带了头像数据，直接使用（确保发帖时显示最新头像）
    // 否则从 users.json 中读取
    const avatarColor = req.body.avatarColor || (user ? user.avatarColor : '');
    const avatarImage = req.body.avatarImage !== undefined ? req.body.avatarImage : (user ? (user.avatarImage || '') : '');

    const posts = readData(FILES.posts);
    const newPost = {
        id: posts.length > 0 ? Math.max(...posts.map(p => p.id)) + 1 : 1,
        author: author,
        content: content,
        phone: phone,
        tag: tag || '',
        time: new Date().toLocaleString('zh-CN'),
        likes: 0,
        replies: [],
        avatarColor: avatarColor,
        avatarImage: avatarImage
    };

    posts.push(newPost);
    writeData(FILES.posts, posts);

    // 更新用户的发帖数
    const allUsers = readData(FILES.users);
    const foundUser = allUsers.find(u => u.phone === phone);
    if (foundUser) {
        foundUser.totalPosts = (foundUser.totalPosts || 0) + 1;
        writeData(FILES.users, allUsers);
    }

    // 更新统计
    const stats = readStats();
    stats.totalPosts += 1;
    saveStats(stats);

    console.log(`[发帖] ${author}: ${content.substring(0, 30)}...`);

    res.json({
        success: true,
        message: '发布成功',
        data: newPost
    });
});

// 删除帖子
app.delete('/api/posts/:id', (req, res) => {
    const { id } = req.params;
    const { phone } = req.body;

    if (!phone) {
        return res.json({ success: false, message: '请提供用户信息' });
    }

    const posts = readData(FILES.posts);
    const postIndex = posts.findIndex(p => p.id === parseInt(id));

    if (postIndex === -1) {
        return res.json({ success: false, message: '帖子不存在' });
    }

    const post = posts[postIndex];
    if (post.phone !== phone) {
        return res.json({ success: false, message: '只能删除自己的帖子' });
    }

    posts.splice(postIndex, 1);
    writeData(FILES.posts, posts);

    console.log(`[删帖] ID: ${id}`);

    res.json({ success: true, message: '删除成功' });
});

// 点赞帖子
app.post('/api/posts/:id/like', (req, res) => {
    const { id } = req.params;
    const posts = readData(FILES.posts);
    const post = posts.find(p => p.id === parseInt(id));

    if (!post) {
        return res.json({ success: false, message: '帖子不存在' });
    }

    post.likes = (post.likes || 0) + 1;
    writeData(FILES.posts, posts);

    res.json({ success: true, message: '点赞成功', likes: post.likes });
});

// ================================================================
// 5. 问题反馈
// ================================================================

// 提交反馈
app.post('/api/feedbacks', (req, res) => {
    const { name, contact, type, content, phone } = req.body;

    if (!name || !type || !content || !phone) {
        return res.json({ success: false, message: '请填写所有必填项' });
    }

    const feedbacks = readData(FILES.feedbacks);
    const newFeedback = {
        id: feedbacks.length + 1,
        name: name,
        contact: contact || '',
        type: type,
        content: content,
        phone: phone,
        time: new Date().toLocaleString('zh-CN'),
        status: 'pending',  // pending, read, resolved
        createdAt: new Date().toISOString()
    };

    feedbacks.push(newFeedback);
    writeData(FILES.feedbacks, feedbacks);

    // 更新统计
    const stats = readStats();
    stats.totalFeedbacks += 1;
    saveStats(stats);

    console.log(`[反馈] ${name} (${type}): ${content.substring(0, 30)}...`);

    res.json({
        success: true,
        message: '反馈提交成功，我们会尽快处理！',
        data: newFeedback
    });
});

// 获取反馈列表（管理员用）
app.get('/api/feedbacks', (req, res) => {
    const { phone } = req.query;
    const feedbacks = readData(FILES.feedbacks);

    // 如果是管理员，返回所有反馈；否则只返回自己的
    if (phone === 'admin') {
        return res.json({ success: true, data: feedbacks });
    }

    const userFeedbacks = feedbacks.filter(f => f.phone === phone);
    res.json({ success: true, data: userFeedbacks });
});

// ================================================================
// 6. 网络状态测试
// ================================================================
app.get('/api/network-test', (req, res) => {
    const startTime = Date.now();

    res.json({
        success: true,
        message: '网络连接正常',
        data: {
            latency: Date.now() - startTime,
            serverTime: new Date().toISOString(),
            timestamp: Date.now()
        }
    });
});

// ================================================================
// 7. 获取用户信息
// ================================================================
app.get('/api/user/:phone', (req, res) => {
    const { phone } = req.params;
    const users = readData(FILES.users);
    const user = users.find(u => u.phone === phone);

    if (!user) {
        return res.json({ success: false, message: '用户不存在' });
    }

    res.json({
        success: true,
        data: {
            phone: user.phone,
            nickname: user.nickname,
            avatarColor: user.avatarColor,
            avatarImage: user.avatarImage || '',
            totalPosts: user.totalPosts || 0,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin
        }
    });
});

// ================================================================
// 8. 健康检查
// ================================================================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        timestamp: new Date().toISOString()
    });
});

// ================================================================
// 静态文件服务（用于托管前端页面）
// ================================================================
// 将上一级目录的个人网页作为静态文件
app.use(express.static(path.join(__dirname, '..')));

// ================================================================
// 启动服务器
// ================================================================
app.listen(PORT, '0.0.0.0', () => {
    console.log('===========================================');
    console.log('  PVZ小齿轮 后端服务器已启动');
    console.log('===========================================');
    console.log(`  服务器地址: http://localhost:${PORT}`);
    console.log(`  API地址:    http://localhost:${PORT}/api`);
    console.log(`  状态检查:   http://localhost:${PORT}/api/status`);
    console.log(`  健康检查:   http://localhost:${PORT}/api/health`);
    console.log('===========================================');
    console.log('  数据目录:', DATA_DIR);
    console.log('===========================================');
    console.log('  支持的API:');
    console.log('  POST /api/send-code        - 发送验证码');
    console.log('  POST /api/verify-code      - 验证码登录');
    console.log('  POST /api/update-profile   - 更新用户资料');
    console.log('  GET  /api/posts            - 获取帖子列表');
    console.log('  POST /api/posts            - 发布帖子');
    console.log('  DELETE /api/posts/:id      - 删除帖子');
    console.log('  POST /api/posts/:id/like   - 点赞帖子');
    console.log('  POST /api/feedbacks        - 提交反馈');
    console.log('  GET  /api/network-test     - 网络测试');
    console.log('  GET  /api/status           - 服务器状态');
    console.log('===========================================');
});