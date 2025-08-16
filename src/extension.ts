import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';
import { IMessageHandler } from './messageHandlers/i_message_handler';
import { MessageHandlerFactory } from './messageHandlers/message_handler_factory';

export function activate(context: vscode.ExtensionContext) {
	console.log('Log Viewer extension is now active!');

	// 确保全局存储目录存在
	ensureGlobalStorageDirectory(context);

	const config = vscode.workspace.getConfiguration('logViewer');
	const clientLogPath = config.get('clientLogPath') as string;
	const serverLogPath = config.get('serverLogPath') as string;

	// 快速搜索关键词配置
	const quickSearchKeywords = config.get('quickSearchKeywords') as string[] || ['all_succ', 'traceback'];

	// 快速搜索标签颜色配置
	const quickSearchColors = config.get('quickSearchColors') as string[] || ['#4CAF50', '#FF9800', '#E91E63', '#2196F3', '#9C27B0', '#FF5722'];

	console.log('Client log path:', clientLogPath);
	console.log('Server log pattern:', serverLogPath);
	console.log('Quick search keywords:', quickSearchKeywords);
	console.log('Quick search colors:', quickSearchColors);

	const clientProvider = new LogViewerProvider('client', clientLogPath, context, quickSearchKeywords, quickSearchColors);
	const serverProvider = new LogViewerProvider('server', serverLogPath, context, quickSearchKeywords, quickSearchColors);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('logViewerClientView', clientProvider),
		vscode.window.registerWebviewViewProvider('logViewerServerView', serverProvider)
	);

	context.subscriptions.push({
		dispose: () => {
			clientProvider.dispose();
			serverProvider.dispose();
		}
	});
}

// 确保全局存储目录存在
function ensureGlobalStorageDirectory(context: vscode.ExtensionContext): void {
	try {
		const storagePath = context.globalStorageUri.fsPath;
		if (!fs.existsSync(storagePath)) {
			fs.mkdirSync(storagePath, { recursive: true });
			console.log('Created global storage directory:', storagePath);
		}
	} catch (error) {
		console.error('Failed to create global storage directory:', error);
	}
}

// 刷新频率
const REFRESH_INTERVAL = 200;

class LogViewerProvider implements vscode.WebviewViewProvider {
	private type: 'client' | 'server';
	private logPathOrPattern: string;
	private context: vscode.ExtensionContext;
	view?: vscode.WebviewView;
	files: string[] = [];
	logBuffer: string[] = [];
	private pendingLog: string[] = []; // 用于存储待处理的日志，按 REFRESH_INTERVAL 刷新
	private lastSizes: Record<string, number> = {};
	private clearedOffsets: Record<string, number> = {};
	private updateTimer: NodeJS.Timeout | null = null;
	private searchRefreshTimer: NodeJS.Timeout | null = null;
	inSearchView: number = -1;
	private currentSearchQuery: string = '';
	private readonly maxHistory = 1000;
	private readonly historyFile: string;
	private readonly clearedStateFile: string;
	private readonly stateKey: string;
	private readonly messageHandlers: Map<string, IMessageHandler>;

	// 快速搜索关键词配置
	private quickSearchKeywords: string[];

	// 快速搜索标签颜色配置
	private quickSearchColors: string[];

	// 快速搜索计数器 - 动态生成
	private quickSearchCounts: Map<string, number> = new Map();


	constructor(type: 'client' | 'server', logPathOrPattern: string, context: vscode.ExtensionContext, quickSearchKeywords: string[], quickSearchColors: string[]) {
		this.type = type;
		this.logPathOrPattern = logPathOrPattern;
		this.context = context;
		this.quickSearchKeywords = quickSearchKeywords;
		this.quickSearchColors = quickSearchColors;

		// 确保存储目录存在
		const storageDir = context.globalStorageUri.fsPath;
		if (!fs.existsSync(storageDir)) {
			fs.mkdirSync(storageDir, { recursive: true });
		}

		this.historyFile = path.join(storageDir, `${type}_searchHistory.json`);
		this.clearedStateFile = path.join(storageDir, `${type}_cleared.json`);
		this.stateKey = `${type}_panel_state`;
		this.messageHandlers = MessageHandlerFactory.createHandlers(this);

		// 初始化快速搜索计数器
		Array.from(this.quickSearchKeywords).forEach(keyword => {
			this.quickSearchCounts.set(keyword, 0);
		});

		// 预加载历史记录和状态
		this.loadClearedState();
		this.preloadHistory();

		try {
			console.log(`[${this.type}] 尝试匹配路径: ${this.logPathOrPattern}`);
			this.files = glob.sync(this.logPathOrPattern);
			console.log(`[${this.type}] 找到的文件:`, this.files);

			if (this.files.length === 0) {
				console.warn(`[${this.type}] 警告: 没有找到匹配的文件，路径: ${this.logPathOrPattern}`);
				// 如果路径是单个文件且不存在，尝试创建目录
				if (!this.logPathOrPattern.includes('*') && !this.logPathOrPattern.includes('[') && !this.logPathOrPattern.includes('?')) {
					const dir = path.dirname(this.logPathOrPattern);
					if (!fs.existsSync(dir)) {
						try {
							fs.mkdirSync(dir, { recursive: true });
							console.log(`[${this.type}] 创建目录: ${dir}`);
						} catch (err) {
							console.error(`[${this.type}] 创建目录失败:`, err);
						}
					}
				}
			}

			for (const file of this.files) {
				this.lastSizes[file] = 0;
				fs.watchFile(file, { interval: REFRESH_INTERVAL }, () => this.handleFileChange(file));
			}
		} catch (error) {
			console.error(`[${this.type}] glob.sync 错误:`, error);
			console.error(`[${this.type}] 路径: ${this.logPathOrPattern}`);
			this.files = [];
		}
	}

	resolveWebviewView(webviewView: vscode.WebviewView) {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
		};

		try {
			const htmlUri = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webview.html');
			const htmlContent = fs.readFileSync(htmlUri.fsPath, 'utf8');
			webviewView.webview.html = htmlContent;
		} catch (error) {
			console.error(`[${this.type}] Failed to load webview HTML:`, error);
			// 提供错误页面
			const errorMessage = error instanceof Error ? error.message : String(error);
			webviewView.webview.html = `
				<!DOCTYPE html>
				<html>
				<head>
					<meta charset="utf-8">
					<title>Log Viewer Error</title>
				</head>
				<body style="background: #1e1e1e; color: white; padding: 20px; font-family: sans-serif;">
					<h3>Log Viewer 加载失败</h3>
					<p>错误信息: ${errorMessage}</p>
					<button onclick="location.reload()" style="padding: 8px 16px; margin-top: 10px;">
						重新加载
					</button>
				</body>
				</html>
			`;
		}

		if (this.logBuffer.length === 0) {
			this.pushInitialLog();
		} else {
			const lastLines = this.logBuffer.slice(-1000);
			this.flushLogToWebview(lastLines);
		}

		// 初始化快速搜索计数器
		this.checkAndUpdateQuickSearchCounts();

		this.sendHistory();
		this.sendCachedPanelState();


		webviewView.webview.onDidReceiveMessage(msg => {
			this.handleWebviewMessage(msg);
		});
	}

	sendCachedPanelState(): void {
		if (!this.view) {
			return;
		}
		const cached = this.context.globalState.get(this.stateKey) as any;
		if (cached) {
			this.view.webview.postMessage({ type: 'restorePanelState', payload: cached });

			// 如果恢复的状态中有搜索文本，启动搜索定时器
			if (cached.searchText && cached.searchText.trim()) {
				// 延迟启动定时器，确保前端状态已恢复
				setTimeout(() => {
					this.currentSearchQuery = cached.searchText;
					this.startSearchRefreshTimer();
				}, 100);
			}
		}
		// 发送 log
		if (this.inSearchView === -1) {
			const lastLines = this.logBuffer.slice(-1000);
			this.flushLogToWebview(lastLines);
		} else {
			// index 前后 500 条
			const index = this.inSearchView;
			const startIndex = Math.max(0, index - 500);
			const endIndex = Math.min(index + 500, this.logBuffer.length);
			const log = this.logBuffer.slice(startIndex, endIndex);
			this.flushLogToWebview(log);
		}
	}

	private handleWebviewMessage(msg: any) {
		const handler = this.messageHandlers.get(msg.type);
		if (handler) {
			try {
				handler.handle(msg);
			} catch (error) {
				console.error(`Error handling message type '${msg.type}':`, error);
			}
		} else {
			console.warn(`Unknown message type: ${msg.type}`);
		}
	}

	private startSearchRefreshTimer() {
		if (this.searchRefreshTimer) {
			clearInterval(this.searchRefreshTimer);
		}

		if (this.currentSearchQuery.trim()) {
			this.searchRefreshTimer = setInterval(() => {
				this.refreshSearchResults();
			}, REFRESH_INTERVAL);
		}
	}

	stopSearchRefreshTimer() {
		if (this.searchRefreshTimer) {
			clearInterval(this.searchRefreshTimer);
			this.searchRefreshTimer = null;
		}
	}

	private refreshSearchResults() {
		if (!this.currentSearchQuery.trim() || !this.view) {
			return;
		}

		const matches = this.performSearch(this.currentSearchQuery);
		this.view.webview.postMessage({ type: 'searchResult', payload: matches });
	}

	performSearch(query: string): any[] {
		const matches = [];

		// 预编译正则表达式，提高性能
		const searchRegex = new RegExp(query, 'gi');

		// 创建当前日志缓冲区的快照
		const logSnapshot = [...this.logBuffer];

		// 倒着遍历日志，匹配到100条时停止
		const maxMatches = 100;
		for (let i = logSnapshot.length - 1; i >= 0 && matches.length < maxMatches; i--) {
			const line = logSnapshot[i];
			// 使用预编译的正则表达式，性能更好
			searchRegex.lastIndex = 0; // 重置lastIndex避免状态问题
			if (searchRegex.test(line)) {
				matches.push({
					index: i,
					content: line,
					contentHash: line.substring(0, 100)
				});
			}
		}
		matches.reverse();
		return matches;
	}


	private pushInitialLog() {
		for (const file of this.files) {
			if (!fs.existsSync(file)) {
				continue;
			}
			const stats = fs.statSync(file);
			this.lastSizes[file] = stats.size;
		}
		this.flushLogToWebview([]);
	}

	private handleFileChange(file: string) {
		if (!fs.existsSync(file)) {
			return;
		}

		const stats = fs.statSync(file);
		const newSize = stats.size;
		const cleared = this.clearedOffsets[file] ?? 0;
		const oldSize = Math.max(this.lastSizes[file] ?? 0, cleared);

		// 说明文件被清空了
		if (newSize < oldSize) {
			this.lastSizes[file] = newSize;
			this.clearedOffsets[file] = 0;
			return;
		}

		if (newSize > oldSize) {
			const fd = fs.openSync(file, 'r');
			const buffer = Buffer.alloc(newSize - oldSize);
			fs.readSync(fd, buffer, 0, buffer.length, oldSize);
			fs.closeSync(fd);

			const appended = buffer.toString('utf8');
			const lines = appended.split('\n').filter(Boolean);
			this.pendingLog.push(...lines);
			this.lastSizes[file] = newSize;
		}

		this.scheduleLogFlush();
	}

	private scheduleLogFlush() {
		if (this.updateTimer) {
			return;
		}

		if (this.pendingLog.length > 0) {
			const sorted = this.sortLogLines(this.pendingLog);

			// 在添加到 logBuffer 之前，先检查新增日志中的匹配
			this.updateQuickSearchCountsFromNewLogs(sorted);

			this.logBuffer.push(...sorted);
			this.pendingLog = [];
		}

		this.updateTimer = setTimeout(() => {
			// 如果用户正在查看特定行（点击了匹配栏），不发送日志更新
			if (this.inSearchView >= 0) {
				this.updateTimer = null;
				return;
			}

			// 其他情况都正常发送日志更新
			const lastLines = this.logBuffer.slice(-1000);
			this.flushLogToWebview(lastLines);

			this.updateTimer = null;
		}, REFRESH_INTERVAL);
	}

	flushLogToWebview(lines: string[]) {
		if (!this.view) {
			return;
		}
		this.view.webview.postMessage({
			type: 'log',
			lines: lines,
			targetLineIndex: undefined
		});
	}

	flushLogToWebviewWithTarget(lines: string[], targetLineIndex: number) {
		if (!this.view) {
			return;
		}
		this.view.webview.postMessage({
			type: 'log',
			lines: lines,
			targetLineIndex: targetLineIndex
		});
	}

	private sortLogLines(lines: string[]): string[] {
		return lines
			.map(line => {
				const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{6})/);
				const ts = match ? new Date(match[1].replace(',', '.')).getTime() : 0;
				return { line, ts };
			})
			.sort((a, b) => a.ts - b.ts)
			.map(entry => entry.line);
	}

	private sendHistory() {
		if (!this.view) {
			return;
		}
		const history = this.loadHistory();
		this.view.webview.postMessage({ type: 'history', history });
	}

	private loadHistory(): string[] {
		try {
			if (!fs.existsSync(this.historyFile)) {
				console.log(`[${this.type}] 历史记录文件不存在: ${this.historyFile}`);
				return [];
			}

			const raw = fs.readFileSync(this.historyFile, 'utf-8');
			const history = JSON.parse(raw);

			if (Array.isArray(history)) {
				console.log(`[${this.type}] 成功加载历史记录，共 ${history.length} 条`);
				return history;
			} else {
				console.warn(`[${this.type}] 历史记录文件格式错误，重置为空数组`);
				return [];
			}
		} catch (error) {
			console.error(`[${this.type}] 加载历史记录失败:`, error);
			console.error(`[${this.type}] 历史记录文件路径: ${this.historyFile}`);
			return [];
		}
	}

	private preloadHistory() {
		try {
			const history = this.loadHistory();
			if (history.length > 0) {
				this.currentSearchQuery = history[history.length - 1]; // 加载最后一个搜索文本
				this.startSearchRefreshTimer(); // 启动搜索定时器
			}
		} catch (error) {
			console.error(`Failed to preload history for ${this.type}:`, error);
		}
	}

	private loadClearedState() {
		try {
			const raw = fs.readFileSync(this.clearedStateFile, 'utf-8');
			this.clearedOffsets = JSON.parse(raw);
		} catch {
			this.clearedOffsets = {};
		}
	}

	dispose(): void {
		// 清理所有定时器
		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
			this.updateTimer = null;
		}
		if (this.searchRefreshTimer) {
			clearInterval(this.searchRefreshTimer);
			this.searchRefreshTimer = null;
		}
	}

	// 更新快速搜索计数器和颜色配置
	private updateQuickSearchCounts(): void {
		if (!this.view) {
			return;
		}

		// 构建动态的计数器数据
		const payload: Record<string, number> = {};
		Array.from(this.quickSearchKeywords).forEach(keyword => {
			payload[keyword] = this.quickSearchCounts.get(keyword) || 0;
		});

		this.view.webview.postMessage({
			type: 'updateQuickSearchCounts',
			payload: payload,
			colors: this.quickSearchColors // 同时发送颜色配置
		});
	}

	// 检查并更新快速搜索计数
	private checkAndUpdateQuickSearchCounts(): void {
		// 重置所有计数器为 0
		Array.from(this.quickSearchKeywords).forEach(keyword => {
			this.quickSearchCounts.set(keyword, 0);
		});

		// 复用增量更新逻辑，传入整个 logBuffer
		this.updateQuickSearchCountsFromNewLogs(this.logBuffer);
	}

	// 从新增日志中更新快速搜索计数（性能优化版本）
	private updateQuickSearchCountsFromNewLogs(newLogs: string[]): void {
		// 预编译正则表达式，提高性能
		const regexMap = new Map<string, RegExp>();
		Array.from(this.quickSearchKeywords).forEach(keyword => {
			regexMap.set(keyword, new RegExp(keyword, 'i'));
		});

		// 只检查新增的日志，不区分大小写
		newLogs.forEach(line => {
			Array.from(this.quickSearchKeywords).forEach(keyword => {
				const regex = regexMap.get(keyword)!;
				if (regex.test(line)) {
					const currentCount = this.quickSearchCounts.get(keyword) || 0;
					this.quickSearchCounts.set(keyword, currentCount + 1);
				}
			});
		});

		// 向前端发送更新
		this.updateQuickSearchCounts();
	}
}
