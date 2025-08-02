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
		const unique = Array.from(new Set(history)).slice(-this.provider.maxHistory);
		fs.mkdirSync(path.dirname(this.provider.historyFile), { recursive: true });
		fs.writeFileSync(this.provider.historyFile, JSON.stringify(unique, null, 2), 'utf-8');
	}
} 