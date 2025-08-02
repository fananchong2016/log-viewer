import { IMessageHandler } from './i_message_handler';

export class SearchLogHandler implements IMessageHandler {
	constructor(private provider: any) {}

	handle(msg: any): void {
		if (!this.provider.view) {
			return;
		}
		const { query, regex, caseSensitive } = msg;
		
		// 保存搜索状态
		this.provider.currentSearchQuery = query;
		this.provider.currentSearchRegex = regex;
		this.provider.currentSearchCaseSensitive = caseSensitive;
		
		// 如果搜索查询为空，停止定时器并重置状态
		if (!query.trim()) {
			this.provider.stopSearchRefreshTimer();
			this.provider.inSearchView = -1; // 重置查看状态
			this.provider.view.webview.postMessage({ type: 'searchResult', payload: [] });
			return;
		}
		
		// 使用公共搜索方法
		const matches = this.provider.performSearch(query, regex, caseSensitive);
		console.log(`searchLog: found ${matches.length} matches in ${this.provider.logBuffer.length} lines`);
		this.provider.view.webview.postMessage({ type: 'searchResult', payload: matches });
		
		// 启动搜索刷新定时器
		this.provider.startSearchRefreshTimer();
	}
} 