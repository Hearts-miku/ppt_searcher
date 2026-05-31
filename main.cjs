// main.cjs
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');

let mainWindow;
let serverProcess;
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
  // 把端口和生产标记注入到当进程的全局 env 中，让内联加载的 Express 直接接手并侦听相应接口
  process.env.PORT = port;
  process.env.NODE_ENV = 'production';
  
  try {
    const serverPath = path.join(__dirname, 'dist', 'server.cjs');
    require(serverPath);
    console.log(`[Backend-Embed]: Express backend successfully embedded and listening on port ${port}`);
  } catch (err) {
    console.error("[Backend-Embed-Err]: Failed to boot embedded backend server:", err);
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

  // 等待 Express 服务器温热建立连通后，加载对应页面 (因为是进程中直接启动，1.2s 的缓冲已经足够宽裕)
  setTimeout(() => {
    mainWindow.loadURL(`http://localhost:${port}`);
  }, 1200);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  findFreePort(DEFAULT_PORT, (err, freePort) => {
    if (err) {
      console.error("无法分配本地连通接口端口:", err);
      app.quit();
      return;
    }
    startBackendServer(freePort);
    createWindow(freePort);
  });
});

// 当 Electron 所有窗口关闭时，退出应用 (进程释放后进程内部 Express 会全部释放，不会有常驻遗存)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
