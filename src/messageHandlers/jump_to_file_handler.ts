import { IMessageHandler } from './i_message_handler';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class JumpToFileHandler implements IMessageHandler {
	constructor(private provider: any) {}

	async handle(msg: any): Promise<void> {
		try {
			const { fileName, lineNumber, fullPath } = msg.payload;
			
			// 优先使用完整路径
			let targetPath = fullPath;
			
			// 如果没有完整路径，尝试在工作区中查找文件
			if (!targetPath) {
				targetPath = await this.findFileInWorkspace(fileName);
			}
			
			if (targetPath && fs.existsSync(targetPath)) {
				// 打开文件并跳转到指定行
				const document = await vscode.workspace.openTextDocument(targetPath);
				const editor = await vscode.window.showTextDocument(document);
				
				// 跳转到指定行
				const position = new vscode.Position(lineNumber - 1, 0);
				editor.selection = new vscode.Selection(position, position);
				editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
				
				console.log(`[${this.provider.type}] 成功跳转到文件: ${targetPath}:${lineNumber}`);
			} else {
				// 显示错误信息
				vscode.window.showErrorMessage(`无法找到文件: ${fileName || '未知文件'}`);
				console.warn(`[${this.provider.type}] 文件不存在: ${targetPath || fileName}`);
			}
		} catch (error) {
			console.error(`[${this.provider.type}] 跳转文件失败:`, error);
			vscode.window.showErrorMessage(`跳转文件失败: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	
	// 在工作区中查找文件
	private async findFileInWorkspace(fileName: string): Promise<string | null> {
		try {
			// 使用 VS Code 的文件搜索 API
			const files = await vscode.workspace.findFiles(`**/${fileName}`, '**/node_modules/**');
			
			if (files.length > 0) {
				// 返回第一个匹配的文件
				return files[0].fsPath;
			}
			
			// 如果没有找到，尝试模糊匹配
			const fuzzyFiles = await vscode.workspace.findFiles(`**/*${fileName}*`, '**/node_modules/**');
			if (fuzzyFiles.length > 0) {
				return fuzzyFiles[0].fsPath;
			}
			
			return null;
		} catch (error) {
			console.error(`[${this.provider.type}] 搜索文件失败:`, error);
			return null;
		}
	}
} 