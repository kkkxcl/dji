# PVZ小齿轮 - 后端服务器部署指南

## 项目结构

```
个人网页/
├── 个人网页.html          # 前端页面（已集成API）
├── androidgame.apk        # 安卓游戏下载
├── windowsgame.zip        # Windows游戏下载
├── server/                # 后端服务器
│   ├── package.json       # Node.js依赖配置
│   ├── server.js          # 服务器主程序
│   ├── .env.example       # 环境变量示例
│   └── README.md          # 本文件
├── .github/workflows/     # GitHub Actions配置
│   └── deploy-server.yml  # 自动部署工作流
└── data/                  # 服务器数据（自动生成）
    ├── users.json         # 用户数据
    ├── verification_codes.json  # 验证码数据
    ├── posts.json         # 社区帖子
    ├── feedbacks.json     # 问题反馈
    └── stats.json         # 服务器统计
```

## API 接口总览

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/send-code` | 发送手机验证码 |
| POST | `/api/verify-code` | 验证码登录 |
| POST | `/api/update-profile` | 更新用户资料 |
| GET | `/api/posts` | 获取帖子列表 |
| POST | `/api/posts` | 发布帖子 |
| DELETE | `/api/posts/:id` | 删除帖子 |
| POST | `/api/posts/:id/like` | 点赞帖子 |
| POST | `/api/feedbacks` | 提交反馈 |
| GET | `/api/network-test` | 网络连接测试 |
| GET | `/api/status` | 服务器状态 |
| GET | `/api/health` | 健康检查 |

## 部署方案

### 方案一：本地运行（开发测试）

1. **安装 Node.js**
   - 下载地址：https://nodejs.org/ (建议 v18 或 v20 LTS)
   - 安装完成后打开命令行验证：`node --version`

2. **启动服务器**
   ```bash
   cd server
   npm install
   node server.js
   ```

3. **访问网站**
   - 打开浏览器访问：http://localhost:3000
   - 服务器会自动托管前端页面

### 方案二：部署到 GitHub Pages + 独立服务器

1. **将代码推送到 GitHub 仓库**
   ```bash
   git init
   git add .
   git commit -m "初始化项目"
   git remote add origin https://github.com/你的用户名/你的仓库.git
   git push -u origin main
   ```

2. **GitHub Pages 自动部署**
   - 推送到 main 分支后，GitHub Actions 会自动部署前端页面
   - 访问：`https://你的用户名.github.io/你的仓库/个人网页.html`

3. **服务器部署（需要一台VPS）**
   - 在服务器上安装 Node.js
   - 克隆代码到服务器
   - 进入 server 目录运行 `npm install && node server.js`
   - 推荐使用 PM2 管理进程：`npm install -g pm2 && pm2 start server.js`
   - 修改 `个人网页.html` 中的 API_BASE 为你的服务器地址

### 方案三：免费云平台部署（推荐）

#### 方式1：Render（免费）

1. 注册 https://render.com
2. 点击 "New +" → "Web Service"
3. 连接你的 GitHub 仓库
4. 设置：
   - Name: `pvz-server`
   - Environment: `Node`
   - Build Command: `cd server && npm install`
   - Start Command: `cd server && node server.js`
5. 部署完成后，修改前端 API_BASE 为 Render 提供的 URL

#### 方式2：Railway（免费额度）

1. 注册 https://railway.app
2. 点击 "New Project" → "Deploy from GitHub repo"
3. 选择仓库
4. 设置 Start Command: `cd server && node server.js`
5. 部署完成后获取域名

## 配置短信服务

在 `server.js` 中，验证码目前以开发模式返回在API响应中。
如果需要真实的短信发送，可以集成以下服务：

### 阿里云短信
```bash
npm install @alicloud/pop-core
```

### 腾讯云短信
```bash
npm install tencentcloud-sdk-nodejs
```

### Twilio（国际）
```bash
npm install twilio
```

## 安全建议

1. **生产环境**：删除 `server.js` 中 `code: code` 的返回字段
2. **HTTPS**：使用 Nginx 反向代理配置 SSL 证书
3. **验证码发送频率限制**：已在代码中实现 60 秒冷却
4. **验证码有效期**：5 分钟

## 技术栈

- **前端**：原生 HTML + CSS + JavaScript
- **后端**：Node.js + Express
- **数据存储**：本地 JSON 文件
- **部署**：GitHub Actions + GitHub Pages