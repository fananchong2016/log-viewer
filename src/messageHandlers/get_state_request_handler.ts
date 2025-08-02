import { IMessageHandler } from './i_message_handler';

export class GetStateRequestHandler implements IMessageHandler {
	constructor(private provider: any) {}

	handle(msg: any): void {
		this.sendCachedPanelState();
	}

	private sendCachedPanelState(): void {
		if (!this.provider.view) {
			return;
		}
		this.provider.sendCachedPanelState();
	}
} 