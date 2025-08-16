import { IMessageHandler } from './i_message_handler';
import * as fs from 'fs';
import * as path from 'path';

export class ClearLogHandler implements IMessageHandler {
	constructor(private provider: any) { }

	handle(msg: any): void {
		this.clearLog();
	}

	private clearLog(): void {
		for (const file of this.provider.files) {
			if (!fs.existsSync(file)) {
				continue;
			}
			const stats = fs.statSync(file);
			this.provider.clearedOffsets[file] = stats.size;
			this.provider.lastSizes[file] = stats.size;
		}

		fs.mkdirSync(path.dirname(this.provider.clearedStateFile), { recursive: true });
		fs.writeFileSync(this.provider.clearedStateFile, JSON.stringify(this.provider.clearedOffsets, null, 2), 'utf-8');

				this.provider.logBuffer = [];
		this.provider.flushLogToWebview([]);
		
		// 重置所有快速搜索计数器
		if (this.provider.quickSearchCounts) {
			Array.from(this.provider.quickSearchKeywords).forEach((keyword: unknown) => {
				if (typeof keyword === 'string') {
					this.provider.quickSearchCounts.set(keyword, 0);
				}
			});
		}
		
		// 向前端发送重置后的计数器
		if (this.provider.updateQuickSearchCounts) {
			this.provider.updateQuickSearchCounts();
		}
	}
} 