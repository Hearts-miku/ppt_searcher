// main.cjs
const { app, BrowserWindow, dialog, globalShortcut } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');

let mainWindow;
const DEFAULT_PORT = 3000;

// 动态检测端口占用，防止端口冲突
function findFreePort(port, cb) {
  const server = net.createServer();
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      findFreePort(port + 1, cb);
    } else {
      cb(err);
    }
  });
  server.once('listening', () => {
    server.close();
    cb(null, port);
  });
  server.listen(port);
}

function startBackendServer(port) {
  // 把端口和生产标记注入到当前进程的全局 env 中，让内联加载的 Express 直接接手并侦听相应接口
  process.env.PORT = port;
  process.env.NODE_ENV = 'production';
  
  try {
    const serverPath = path.join(__dirname, 'dist', 'server.cjs');
    require(serverPath);
    console.log(`[Backend-Embed]: Express backend successfully embedded and listening on port ${port}`);
  } catch (err) {
    console.error("[Backend-Embed-Err]: Failed to boot embedded backend server:", err);
    // 弹窗提示：帮助用户捕获后端加载失败具体原因（例如缺少本地模块或文件路径问题）
    dialog.showErrorBox(
      "后台服务器启动失败 (Express Start Error)",
      `启动内嵌后台服务时发生未捕获异常，这通常是由于缺少库文件或环境配置引起的。\n\n具体错误详情:\n${err.stack || err.message}`
    );
  }
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "PPT 智能检索器",
    icon: path.join(__dirname, 'public', 'vite.svg'), // 可自行替换为您更炫酷的 .ico / .png 图标
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const appUrl = `http://localhost:${port}`;

  // 监听网页加载失败事件
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Load-Error]: Failed to load URL: ${validatedURL}, Code: ${errorCode}, Desc: ${errorDescription}`);
    dialog.showErrorBox(
      "本地网页加载失败 (Web Load Failed)",
      `客户端无法建立与本地服务端 (${appUrl}) 的物理通信，白屏现象通常由于后台服务被系统安全软件拦截或闪退导致。\n\n网络错误码: ${errorCode}\n说明: ${errorDescription}`
    );
  });

  // 默认启动时打开调试控制台，极其便于您或用户排查任何白屏、API请求报错细节
  mainWindow.webContents.openDevTools();

  // 等待 Express 服务器温热建立连通后，加载对应页面
  setTimeout(() => {
    mainWindow.loadURL(appUrl);
  }, 1200);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  // 注册全局快捷键：Ctrl+Shift+I 随时可唤醒/隐藏 调试面板
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (mainWindow) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  findFreePort(DEFAULT_PORT, (err, freePort) => {
    if (err) {
      dialog.showErrorBox(
        "端口分配错误 (Port Shell Error)",
        `未能在本地分配到任何空闲的 TCP 通信端口，请尝试关闭其他后台软件后重试。\n\n详情: ${err.message}`
      );
      app.quit();
      return;
    }
    startBackendServer(freePort);
    createWindow(freePort);
  });
});

app.on('will-quit', () => {
  // 注销所有全局快捷键
  globalShortcut.unregisterAll();
});

// 当 Electron 所有窗口关闭时，退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
