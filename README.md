# Log Viewer

一个强大的 VS Code 日志查看器扩展，提供实时日志监控、搜索、过滤和语法高亮功能。

## 功能特性

- 🔍 **实时日志监控** - 实时显示客户端和服务器日志
- 🔎 **高级搜索** - 支持正则表达式和区分大小写搜索
- 📊 **日志过滤** - 按时间、级别等条件过滤日志
- 🎨 **语法高亮** - 自动识别和格式化 JSON 错误堆栈
- 📱 **双面板** - 独立的客户端和服务器日志面板
- 💾 **状态保持** - 记住搜索历史和滚动位置

## 安装

1. 在 VS Code 中打开扩展面板 (Ctrl+Shift+X)
2. 搜索 "Log Viewer"
3. 点击安装

## 配置

在 VS Code 设置中配置日志文件路径：

```json
{
  "logViewer.clientLogPath": "D:/your-project/client/log/log.txt",
  "logViewer.serverLogPath": "D:/your-project/server/logs/game*.txt"
}
```

## 使用方法

1. 安装扩展后，在 VS Code 左侧面板中会显示 "Log Viewer" 图标
2. 点击图标打开日志查看器面板
3. 使用搜索框进行日志搜索
4. 支持正则表达式和区分大小写搜索

## 开发

### 环境准备

1. 安装 Node.js (推荐 18.x 或更高版本)
2. 克隆项目
3. 运行 `npm install`

### 本地开发

```bash
# 安装依赖
npm install

# 编译 TypeScript
npm run compile

# 启动开发模式
npm run watch
```

### 调试

1. 按 F5 启动调试
2. 在新窗口中测试扩展功能

## 发布

### 准备工作

1. 注册 [Visual Studio Marketplace](https://marketplace.visualstudio.com/) 账户
2. 创建发布者账户
3. 获取 Personal Access Token (PAT)

### 发布步骤

1. 安装 vsce 工具：
   ```bash
   npm install -g vsce
   ```

2. 登录到发布者账户：
   ```bash
   vsce login <publisher-name>
   ```

3. 打包扩展：
   ```bash
   vsce package
   ```

4. 发布到市场：
   ```bash
   vsce publish
   ```

### 更新版本

1. 修改 `package.json` 中的版本号
2. 运行 `vsce publish` 发布新版本

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 全量拉依赖库

1. 删除 package-lock.json
2. 删除 node_modules
3. npm install
