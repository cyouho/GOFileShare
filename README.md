# GOFileShare
桌面共享文件服务器

**GOFileShare** 是一个基于 Go 和 Web 技术的跨平台磁盘浏览和文件共享工具。它允许用户通过 Web 界面浏览本地磁盘，设置共享文件夹，并通过移动端访问这些共享内容。项目使用 SQLite 持久化共享状态，支持图片、视频和音频的预览与播放。

## 功能

### 服务端 (Web 端)
- **完整磁盘浏览**
  - 显示所有本地磁盘（如 Windows 的 C:、D: 等）。
  - 支持目录导航，点击磁盘或文件夹进入内部。
- **文件夹共享**
  - 通过胶囊按钮（类似 iOS 风格）切换文件夹共享状态：
    - 未共享：蓝色“共享”按钮，点击后变为红色“取消”。
    - 已共享：红色“取消”按钮，点击后变为蓝色“共享”。
  - 共享状态持久化到 SQLite，重启服务后保持一致。
- **文件预览**
  - 支持图片（JPEG/PNG）、视频（MP4）、音频（MP3/WAV）的缩略图和播放。
  - 图片动态生成缩略图，视频和音频使用静态图标。
- **懒加载**
  - 大量文件目录支持分页加载，滚动到底部自动加载更多。

### 客户端 (移动端)
- **共享文件夹访问**
  - 仅显示服务端设置的共享文件夹及其内容。
  - 支持目录导航和文件预览。
- **媒体播放**
  - 与服务端一致，支持图片查看、视频和音频播放，进度条可拖动。

### 技术特点
- **跨平台**：支持 Windows、Linux 和 macOS。
- **持久化**：使用 SQLite 存储共享文件夹路径。
- **安全性**：移动端访问受限于共享文件夹，防止越权。
- **响应式设计**：Web 界面自适应不同屏幕尺寸，模态框支持滚动。

## 项目结构(2025年初)
```
disk-explorer/
├── main.go              # 主程序入口，初始化Gin服务并定义路由
├── handlers/            # HTTP接口处理逻辑
│   └── disk.go          # 包含磁盘、目录、文件访问和共享管理的处理函数
├── models/              # 数据模型定义
│   └── disk.go          # 定义Disk和DirEntry结构体
├── db/                  # SQLite数据库操作
│   └── database.go      # 数据库初始化及共享文件夹管理
├── static/              # 静态文件目录
│   ├── index.html       # 服务端Web界面
│   ├── mobile.html      # 移动端Web界面
│   ├── style.css        # 服务端样式文件
│   ├── script.js        # 服务端前端逻辑
│   ├── mobile.css       # 移动端样式文件
│   ├── mobile.js        # 移动端前端逻辑
│   └── icons/           # 图标文件目录
│       ├── audio-icon.png  # 音频文件默认图标（示例）
│       ├── video-icon.png  # 视频文件默认图标（示例）
│       └── [其他图标]      # 可根据需要添加更多图标
└── disk-explorer.db     # SQLite数据库文件，存储共享文件夹信息
```

## 依赖
- **Go**
  - `github.com/gin-gonic/gin`：Web 框架
  - `github.com/mattn/go-sqlite3`：SQLite 驱动
  - `github.com/disintegration/imaging`：图片缩略图生成
  - `github.com/gabriel-vasile/mimetype`：文件类型检测
- **前端**：纯 HTML/CSS/JavaScript，无外部框架

## 安装与运行
1. **克隆仓库**
   ```bash
   git clone https://github.com/<你的用户名>/GOFileShare.git
   cd GOFileShare
   go mod tidy
   go run main.go