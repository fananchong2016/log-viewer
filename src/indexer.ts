import * as vscode from 'vscode';

export function buildFunctionIndex(): Map<string, vscode.Location[]> {
    const index = new Map<string, vscode.Location[]>();
    const files = vscode.workspace.workspaceFolders;

    if (!files) {
        console.log('No workspace folders found');
        return index;
    }

    // 从配置中获取函数索引路径
    const config = vscode.workspace.getConfiguration('logViewer');
    const functionIndexPaths = config.get('functionIndexPaths') as string[] || [];

    console.log('Function index paths:', functionIndexPaths);

    // 处理每个配置的路径
    functionIndexPaths.forEach(pattern => {
        try {
            const fs = require('fs');
            const path = require('path');
            
            // 标准化路径
            const absolutePath = pattern.replace(/\\/g, '/');
            const dirPath = path.dirname(absolutePath);
            const fileName = path.basename(absolutePath);
            
            console.log(`Processing: ${dirPath}/*${fileName}*`);
            
            if (fs.existsSync(dirPath)) {
                const filesInDir = fs.readdirSync(dirPath);
                
                // 通配符匹配
                const regex = new RegExp(fileName.replace(/\*/g, '.*').replace(/\[/g, '\\[').replace(/\]/g, '\\]'));
                const matchingFiles = filesInDir.filter((file: string) => regex.test(file));
                
                console.log(`Found ${matchingFiles.length} matching files`);
                
                matchingFiles.forEach((file: string) => {
                    const fullPath = path.join(dirPath, file);
                    
                    try {
                        const content = fs.readFileSync(fullPath, 'utf8');
                        const lines = content.split('\n');
                        let functionCount = 0;
                        
                        for (let i = 0; i < lines.length; i++) {
                            const line = lines[i];
                            // 匹配缩进的函数定义
                            const match = line.match(/^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
                            if (match) {
                                const fnName = match[1];
                                const uri = vscode.Uri.file(fullPath);
                                const range = new vscode.Range(i, 0, i, line.length);
                                if (!index.has(fnName)) { 
                                    index.set(fnName, []); 
                                }
                                index.get(fnName)?.push(new vscode.Location(uri, range));
                                functionCount++;
                                console.log(`Found function: ${fnName} in ${path.basename(fullPath)}`);
                            }
                        }
                        console.log(`Indexed ${functionCount} functions from ${path.basename(fullPath)}`);
                    } catch (error) {
                        console.error(`Failed to process file ${fullPath}:`, error);
                    }
                });
            } else {
                console.log(`Directory does not exist: ${dirPath}`);
            }
        } catch (error) {
            console.error(`Invalid pattern ${pattern}:`, error);
        }
    });

    console.log(`Function index initialized with ${index.size} functions`);
    return index;
}
