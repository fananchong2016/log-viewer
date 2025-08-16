import { IMessageHandler } from './i_message_handler';
import * as fs from 'fs';
import * as path from 'path';

export class UpdateHistoryHandler implements IMessageHandler {
	constructor(private provider: any) {}

	handle(msg: any): void {
		if (Array.isArray(msg.payload)) {
			this.saveHistory(msg.payload);
		}
	}

	private saveHistory(history: string[]): void {
		try {
			const unique = Array.from(new Set(history)).slice(-this.provider.maxHistory);
			
			// 确保目录存在
			const dir = path.dirname(this.provider.historyFile);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			
			// 写入历史记录
			fs.writeFileSync(this.provider.historyFile, JSON.stringify(unique, null, 2), 'utf-8');
			
			console.log(`[${this.provider.type}] 成功保存历史记录，共 ${unique.length} 条`);
		} catch (error) {
			console.error(`[${this.provider.type}] 保存历史记录失败:`, error);
			console.error(`[${this.provider.type}] 历史记录文件路径: ${this.provider.historyFile}`);
		}
	}
} 