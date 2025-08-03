import * as vscode from 'vscode';

export function getWordAtPosition(doc: vscode.TextDocument, pos: vscode.Position): string | null {
    const wordRange = doc.getWordRangeAtPosition(pos);
    return wordRange ? doc.getText(wordRange) : null;
}

export function isSelfMethod(line: string, word: string): boolean {
    return new RegExp(`self\\.${word}\\b`).test(line);
}
