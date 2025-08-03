const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 读取 package.json
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

console.log('🚀 开始发布 Log Viewer 扩展...');
console.log(`📦 版本: ${packageJson.version}`);

try {
  // 1. 清理和编译
  console.log('📋 清理和编译...');
  execSync('npm run compile', { stdio: 'inherit' });
  
  // 2. 运行测试
  console.log('🧪 运行测试...');
  execSync('npm test', { stdio: 'inherit' });
  
  // 3. 打包扩展
  console.log('📦 打包扩展...');
  execSync('vsce package', { stdio: 'inherit' });
  
  // 4. 显示打包结果
  const vsixFile = `${packageJson.name}-${packageJson.version}.vsix`;
  if (fs.existsSync(vsixFile)) {
    const stats = fs.statSync(vsixFile);
    console.log(`✅ 打包成功: ${vsixFile} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    console.log('\n📝 下一步:');
    console.log('1. 检查 .vsix 文件');
    console.log('2. 运行: vsce publish');
    console.log('3. 或者手动上传到 Visual Studio Marketplace');
  } else {
    console.error('❌ 打包失败: 未找到 .vsix 文件');
  }
  
} catch (error) {
  console.error('❌ 发布失败:', error.message);
  process.exit(1);
} 