import { Component, OnInit } from '@angular/core';
import { LokiAccount } from '../../domains/lokijs';
import { CasinocoinService } from '../../providers/casinocoin.service';
import { LogService } from '../../providers/log.service';
import { Menu as ElectronMenu } from 'electron';
import { ElectronService } from '../../providers/electron.service';

import { WindowRef } from './WindowRef';

@Component({
    selector: 'app-paperwallet',
    templateUrl: './paperwallet.component.html',
    styleUrls: ['./paperwallet.component.scss']
})
export class PaperwalletComponent implements OnInit {
    newAddress = 'Empty';
    newSecretKey = 'Empty';
    checkBox = true;
    accounts: Array<LokiAccount> = [];
    keySet: any[] = [];
    showInstructions = false;
    address_context_menu: ElectronMenu;
    key_context_menu: ElectronMenu;
    selectedAddress: string;
    hideQRCodes = true;

    constructor(private winRef: WindowRef,
                private logger: LogService,
                private casinocoinService: CasinocoinService,
                private electronService: ElectronService) {
        this.logger.debug('### Paperwallet ###');
    }

    ngOnInit() {
        this.logger.debug('### Paperwallet INIT ###');
        const address_context_menu_template = [
            {
                label: 'Copy Address',
                click(menuItem, browserWindow, event) {
                    browserWindow.webContents.send('address-context-menu-event', 'copy-address');
                }
            }
        ];
        const key_context_menu_template = [
            {
                label: 'Copy Key',
                click(menuItem, browserWindow, event) {
                    browserWindow.webContents.send('key-context-menu-event', 'copy-key');
                }
            }
        ];

        this.address_context_menu = this.electronService.remote.Menu.buildFromTemplate(address_context_menu_template);
        this.electronService.ipcRenderer.on('address-context-menu-event', (event, arg) => {
            this.logger.debug('### Paper Wallet Menu Event: ' + arg);
            if (arg === 'copy-address') {
                this.copyAddress();
            } else {
                this.logger.debug('### Context menu not implemented: ' + arg);
            }
        });
        this.key_context_menu = this.electronService.remote.Menu.buildFromTemplate(key_context_menu_template);
        this.electronService.ipcRenderer.on('key-context-menu-event', (event, arg) => {
            this.logger.debug('### Paper Wallet Menu Event: ' + arg);
            if (arg === 'copy-key') {
                this.copykey();
            } else {
                this.logger.debug('### Context menu not implemented: ' + arg);
            }
        });
    }

    copyAddress() {
        if (this.selectedAddress) {
            this.electronService.clipboard.writeText(this.selectedAddress);
        } else {
            this.electronService.clipboard.writeText('');
        }
    }
    copykey() {
        if (this.selectedAddress) {
            this.electronService.clipboard.writeText(this.selectedAddress);
        } else {
            this.electronService.clipboard.writeText('');
        }
    }

    showCreateAddress() {
        const newKeyPair = this.casinocoinService.cscAPI.generateAddress();
        this.newAddress = newKeyPair['address'];
        this.newSecretKey = newKeyPair['secret'];
        this.hideQRCodes = false;
    }

    onPublicContextMenu() {
        this.selectedAddress = this.newAddress;
        this.address_context_menu.popup({window: this.electronService.remote.getCurrentWindow()});
    }

    onPrivateContextMenu() {
        this.selectedAddress = this.newSecretKey;
        this.key_context_menu.popup({window: this.electronService.remote.getCurrentWindow()});
    }

    print(): void {
        const BrowserWindow = this.electronService.remote.BrowserWindow;
        const printContents = this.winRef.nativeWindow.document.getElementById('printsection').innerHTML;
        this.logger.debug('### Paperwallet: ' + printContents);
        let win = new BrowserWindow({ width: 800, height: 700, icon: __dirname + '/favicon.ico' });
        win.on('closed', () => {
            win = null;
        });
        this.logger.debug('### Paperwallet - load html');
        // create BrowserWindow with dynamic HTML content
        const html = [
            '<head><title>Paper Wallet</title><style>.csc-logo{width: 100px; float: left; position: relative;} .key_box{width: 48%; height: 310px; float: left; text-align: center; border: 1px solid black; margin: 2% 0 0 0;} .key_box1{width: 48%; height: 310px; float: left; text-align: center; border: 1px solid black; margin: 2% 0 0 0;} qrcode > canvas {display: block; margin: auto;} qrcode > img {margin: auto;}</style></head>',
            '<body style="font-family: sans-serif">',
            '<div><h1 align="center">CasinoCoin Paper Wallet</h1></div>',
            '<div>',
            printContents,
            '</div>',
            '</body>'].join('');
        win.setMenu(null);
        win.loadURL('data:text/html;charset=utf-8,' + encodeURI(html));
        win.webContents.on('did-finish-load', () => {
            this.logger.debug('### Paperwallet - Print View Loaded');
            win.webContents.print({}, () => {
                this.logger.debug('### Paperwallet - Print Finished');
                win.close();
            });
        });
    }

    instructions() {
        this.showInstructions = true;
    }

}
