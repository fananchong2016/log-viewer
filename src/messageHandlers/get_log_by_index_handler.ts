import { IMessageHandler } from './i_message_handler';

export class GetLogByIndexHandler implements IMessageHandler {
	constructor(private provider: any) { }

	handle(msg: any): void {
		if (!this.provider.view) {
			return;
		}
		const { index, contentHash } = msg;
		console.log(`getLogByIndex: index=${index}, logBuffer.length=${this.provider.logBuffer.length}`);

		// 验证索引有效性
		if (index < 0 || index >= this.provider.logBuffer.length) {
			console.log(`Invalid index: ${index}, logBuffer.length: ${this.provider.logBuffer.length}`);
			// 尝试通过内容哈希查找正确的索引
			if (contentHash) {
				const foundIndex = this.findLogByContentHash(contentHash);
				if (foundIndex !== -1) {
					console.log(`Found log by content hash at index: ${foundIndex}`);
					this.handle({ index: foundIndex });
					return;
				}
			}
			return;
		}

		// 验证内容是否匹配（如果提供了contentHash）
		if (contentHash && this.provider.logBuffer[index].substring(0, 100) !== contentHash) {
			console.log(`Content hash mismatch, searching for correct index...`);
			const foundIndex = this.findLogByContentHash(contentHash);
			if (foundIndex !== -1) {
				console.log(`Found log by content hash at index: ${foundIndex}`);
				this.handle({ index: foundIndex });
				return;
			}
		}

		this.provider.inSearchView = index;
		// index 前后 500 条
		const startIndex = Math.max(0, index - 500);
		const endIndex = Math.min(index + 500, this.provider.logBuffer.length);
		const log = this.provider.logBuffer.slice(startIndex, endIndex);
		// 计算目标行在显示内容中的相对位置
		const targetLineIndex = index - startIndex;

		console.log(`getLogByIndex: startIndex=${startIndex}, endIndex=${endIndex}, targetLineIndex=${targetLineIndex}`);
		console.log(`Target log line: ${this.provider.logBuffer[index]?.substring(0, 100)}...`);

		this.provider.flushLogToWebviewWithTarget(log, targetLineIndex);
	}

	private findLogByContentHash(contentHash: string): number {
		for (let i = 0; i < this.provider.logBuffer.length; i++) {
			if (this.provider.logBuffer[i].substring(0, 100) === contentHash) {
				return i;
			}
		}
		return -1;
	}
} 