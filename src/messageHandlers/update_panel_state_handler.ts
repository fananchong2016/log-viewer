import { IMessageHandler } from './i_message_handler';

export class UpdatePanelStateHandler implements IMessageHandler {
	constructor(private provider: any) {}

	handle(msg: any): void {
		this.updatePanelState(msg.payload);
	}

	private updatePanelState(payload: any): void {
		this.provider.context.globalState.update(this.provider.stateKey, payload);
	}
} 