import { IMessageHandler } from './i_message_handler';

export class GetHistoryRequestHandler implements IMessageHandler {
	constructor(private provider: any) {}

	handle(msg: any): void {
		if (!this.provider.view) {
			return;
		}
		
		// 发送历史记录到前端
		const history = this.provider.loadHistory();
		console.log(`[${this.provider.type}] 响应历史记录请求，共 ${history.length} 条`);
		this.provider.view.webview.postMessage({ type: 'history', history });
	}
} 