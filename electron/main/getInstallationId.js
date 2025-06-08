const fs = require('fs');

function getInstallationTime() {
  try {
    // 获取应用可执行文件路径
    const appPath = process.execPath;
    const stats = fs.statSync(appPath);
    
    // 在不同平台上，创建时间的获取方式不同
    let installTime;
    
    if (process.platform === 'win32') {
      // Windows: 使用 birthtime
      installTime = stats.birthtime;
    } else if (process.platform === 'darwin') {
      // macOS: 使用 birthtime
      installTime = stats.birthtime;
    } else {
      // Linux: 没有 birthtime，使用 mtime
      installTime = stats.mtime;
    }
    
    return installTime;
  } catch (error) {
    console.error('获取安装时间失败:', error);
    return new Date(); // 返回当前时间作为备选
  }
}

function generateInstallationId() {
  const installTime = getInstallationTime();
  const appPath = process.execPath;
  
  // 组合路径和时间生成唯一ID
  const crypto = require('crypto');
  return crypto
    .createHash('md5')
    .update(appPath + installTime.toISOString())
    .digest('hex');
}

module.exports = { getInstallationTime, generateInstallationId };