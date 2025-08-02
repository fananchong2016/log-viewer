import { IMessageHandler } from './i_message_handler';
import { UpdateHistoryHandler } from './update_history_handler';
import { ClearLogHandler } from './clear_log_handler';
import { UpdatePanelStateHandler } from './update_panel_state_handler';
import { GetStateRequestHandler } from './get_state_request_handler';
import { SearchLogHandler } from './search_log_handler';
import { GetLogByIndexHandler } from './get_log_by_index_handler';

export class MessageHandlerFactory {
	static createHandlers(provider: any): Map<string, IMessageHandler> {
		const handlers = new Map<string, IMessageHandler>();
		
		handlers.set('updateHistory', new UpdateHistoryHandler(provider));
		handlers.set('clearLog', new ClearLogHandler(provider));
		handlers.set('updatePanelState', new UpdatePanelStateHandler(provider));
		handlers.set('getStateRequest', new GetStateRequestHandler(provider));
		handlers.set('searchLog', new SearchLogHandler(provider));
		handlers.set('getLogByIndex', new GetLogByIndexHandler(provider));
		
		return handlers;
	}
} 