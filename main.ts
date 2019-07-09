import { app, BrowserWindow, screen, ipcMain, Notification, Menu } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as url from 'url';
import * as fs from 'fs';

let win, serve, debug;
const args = process.argv.slice(1);
serve = args.some(val => val === '--serve');
debug = args.some(val => val === '--debug');

const globalTS: any = global;
globalTS.vars = {};

let applicationQuitCalled = false;

// set application data path
const defaultCSCPath = path.join(app.getPath('home'), '.casinocoin-wlt');
if (!fs.existsSync(defaultCSCPath)) {
  fs.mkdirSync(defaultCSCPath);
}
app.setPath('userData', defaultCSCPath);
// create application backup path
globalTS.vars.backupLocation = path.join(app.getPath('documents'), 'CSC');
if (!fs.existsSync(globalTS.vars.backupLocation)) {
  fs.mkdirSync(globalTS.vars.backupLocation);
}

// configure Winston File loggging
const winston = require('winston');
if (serve || debug) {
  globalTS.loglevel = 'debug';
} else {
  globalTS.loglevel = 'info';
}
const logFolder = path.join(app.getPath('home'), '.casinocoin-wlt', 'logs');
if (!fs.existsSync(logFolder)) {
  fs.mkdirSync(logFolder);
}
const logFilename = new Date().toISOString().replace(/:/g, '.') + '.log';
const logFile = path.join(logFolder, logFilename);
winston.add(new winston.transports.File(
  { filename: logFile,
    level: globalTS.loglevel,
    handleExceptions: true,
    maxsize: 10485760, // 10 MB
    format: winston.format.combine(winston.format.timestamp(), winston.format.printf(i => `${i.timestamp} | [${i.level}] ${i.message}`)),
    maxFiles: 5,
    colorize: false
  })
);
winston.remove(winston.transports.Console);
winston.level = globalTS.loglevel;
globalTS.logger = winston;

// define function to send update messages to window
autoUpdater.logger = winston;
function sendStatusToWindow(text, message, content) {
  winston.log('info', text);
  const eventMessage = {'event': message, 'data': content};
  win.webContents.send('update-message', eventMessage);
}

autoUpdater.on('checking-for-update', () => {
  sendStatusToWindow('Checking for update...', 'checking-for-update', null);
});

autoUpdater.on('update-available', (info) => {
  sendStatusToWindow('Update available.', 'update-available', info);
});

autoUpdater.on('update-not-available', (info) => {
  sendStatusToWindow('Update not available.', 'update-not-available', info);
});

autoUpdater.on('error', (err) => {
  sendStatusToWindow('Error in auto-updater. ' + err, 'error', err);
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = 'Download speed: ' + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + '/' + progressObj.total + ')';
  sendStatusToWindow(log_message, 'download-progress', progressObj);
});

autoUpdater.on('update-downloaded', (info) => {
  sendStatusToWindow('Update downloaded', 'update-downloaded', info);
});

ipcMain.on('autoupdate-restart', (ipcevent, arg) => {
  autoUpdater.quitAndInstall();
});

function createWindow() {

  winston.log('info', 'Create Native Window');
  const electronScreen = screen;
  const size = electronScreen.getPrimaryDisplay().workAreaSize;
  const minimalWidth = Math.min(size.width, 1024);
  const minimalHeight = Math.min(size.height, 720);

  // Create the browser window.
  win = new BrowserWindow({
    x: 0,
    y: 0,
    width: minimalWidth,
    minWidth: minimalWidth,
    height: minimalHeight,
    minHeight: minimalHeight,
    icon: __dirname + '/favicon.ico',
    webPreferences: {
      nodeIntegration: true,
      webSecurity: false
    }
  });

  if (serve) {
    require('electron-reload')(__dirname, {
      electron: require(`${__dirname}/node_modules/electron`)
    });
    win.loadURL('http://localhost:4200');
  } else {
    win.loadURL(url.format({
      pathname: path.join(__dirname, 'dist/index.html'),
      protocol: 'file:',
      slashes: true
    }));
  }

  if (serve) {
    win.webContents.openDevTools();
  }

  win.on('close', (event) => {
    winston.log('info', 'Window close');
    if (win == null) {
      winston.log('info', 'Window == null');
    } else if (!applicationQuitCalled) {
      event.preventDefault();
      applicationQuitCalled = true;
      if (win !== null) {
        ipcMain.on('wallet-closed', (ipcevent, arg) => {
          winston.log('info', 'Saved Wallet Before Quit Finished, now we close the app');
          win.close();
        });
        // Send event to renderer to save and close wallet
        win.webContents.send('action', 'quit-wallet');
      } else {
        // window is already null so walletService got already killed
        winston.log('info', 'Window == null');
      }
    } else {
       winston.log('info', 'Window close - final exit');
    }
  });

  // Emitted when the window is closed.
  win.on('closed', () => {
    // Dereference the window object, usually you would store window
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    winston.log('info', 'Window closed');
    win = null;
  });

  // push notification using electron-notification-desktop
  ipcMain.on('push-notification', (event, arg) => {
    winston.log('info', 'Notification: ' + arg.title);
    const notification = new Notification( {
      title: arg.title,
      body: arg.body,
      icon: path.join(__dirname, 'assets/brand/casinocoin-icon-256x256.png')
    });
    notification.show();
  });

  // hide the application main menu by default
  win.setMenu(null);

  // Create the OSX Application's main menu as its needed for cut/copy/paste/quit to work
  const template: Electron.MenuItemConstructorOptions[] = [{
    label: 'CasinoCoin Wallet',
    submenu: [
      {label: 'Cut', accelerator: 'Command+X', role: 'cut'},
      {label: 'Copy', accelerator: 'Command+C', role: 'copy'},
      {label: 'Paste', accelerator: 'Command+V', role: 'paste'},
      {type: 'separator'},
      {label: 'Quit', accelerator: 'Command+Q', click: function() { app.quit(); }}
    ]
  }];
  const menu = Menu.buildFromTemplate(template);
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(menu);
  }
}

try {

  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.
  app.on('ready', () => {
    createWindow();
    setTimeout(() => autoUpdater.checkForUpdates(), 500);
  });

  app.on('before-quit', (event) => {
    winston.log('info', 'before-quit');
  });

  // Quit when all windows are closed.
  app.on('window-all-closed', () => {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    winston.log('info', 'window-all-closed');
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
      createWindow();
    }
  });

} catch (e) {
  // Catch Error
  // throw e;
}
