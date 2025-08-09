import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';
import { IMessageHandler } from './messageHandlers/i_message_handler';
import { MessageHandlerFactory } from './messageHandlers/message_handler_factory';

export function activate(context: vscode.ExtensionContext) {
	console.log('Log Viewer extension is now active!');

	const config = vscode.workspace.getConfiguration('logViewer');
	const clientLogPath = config.get('clientLogPath') as string;
	const serverLogPattern = config.get('serverLogPath') as string;

	console.log('Client log path:', clientLogPath);
	console.log('Server log pattern:', serverLogPattern);

	const clientProvider = new LogViewerProvider('client', clientLogPath, context);
	const serverProvider = new LogViewerProvider('server', serverLogPattern, context);

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

// 刷新频率
const REFRESH_INTERVAL = 50;

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
	private currentSearchRegex: boolean = false;
	private currentSearchCaseSensitive: boolean = false;
	private readonly maxHistory = 1000;
	private readonly historyFile: string;
	private readonly clearedStateFile: string;
	private readonly stateKey: string;
	private readonly messageHandlers: Map<string, IMessageHandler>;


	constructor(type: 'client' | 'server', logPathOrPattern: string, context: vscode.ExtensionContext) {
		this.type = type;
		this.logPathOrPattern = logPathOrPattern;
		this.context = context;
		this.historyFile = path.join(context.globalStorageUri.fsPath, `${type}_searchHistory.json`);
		this.clearedStateFile = path.join(context.globalStorageUri.fsPath, `${type}_cleared.json`);
		this.stateKey = `${type}_panel_state`;
		this.messageHandlers = MessageHandlerFactory.createHandlers(this);
		this.loadClearedState();

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
					this.currentSearchRegex = false; // 默认值，实际应该从状态中恢复
					this.currentSearchCaseSensitive = false; // 默认值，实际应该从状态中恢复
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

		const matches = this.performSearch(this.currentSearchQuery, this.currentSearchRegex, this.currentSearchCaseSensitive);
		this.view.webview.postMessage({ type: 'searchResult', payload: matches });
	}

	performSearch(query: string, regex: boolean, caseSensitive: boolean): any[] {
		let flags = caseSensitive ? 'g' : 'gi';
		let r: RegExp = regex
			? new RegExp(query, flags)
			: new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);

		const matches = [];

		// 创建当前日志缓冲区的快照
		const logSnapshot = [...this.logBuffer];

		for (let i = 0; i < logSnapshot.length; i++) {
			const line = logSnapshot[i];
			// 为每一行创建新的正则表达式实例，避免 lastIndex 问题
			const lineRegex = new RegExp(r.source, r.flags);
			if (lineRegex.test(line)) {
				matches.push({
					index: i,
					content: line,
					contentHash: line.substring(0, 100)
				});
			}
		}

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
			const raw = fs.readFileSync(this.historyFile, 'utf-8');
			return JSON.parse(raw);
		} catch {
			return [];
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
}
