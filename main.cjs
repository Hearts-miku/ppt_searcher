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
  const serverPath = path.join(__dirname, 'dist', 'server.cjs');
  
  // 在后台静默 spawn 运行我们编译出的 Node.js 后端 cjs 包
  serverProcess = spawn('node', [serverPath], {
    env: { ...process.env, PORT: port, NODE_ENV: 'production' },
    windowsHide: true // 极其关键：防止在 Windows 系统中运行时弹出黑乎乎的 CMD 命令行窗口
  });

  serverProcess.stdout.on('data', (data) => console.log(`[Backend]: ${data}`));
  serverProcess.stderr.on('data', (data) => console.error(`[Backend-Err]: ${data}`));
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

  // 等待 Express 服务器温热建立连通后，加载对应本地服务页面
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

// 安全垃圾回收：当 Electron 所有窗口关闭时，彻底杀掉 Express 后门常驻进程，保障极低能耗
app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
