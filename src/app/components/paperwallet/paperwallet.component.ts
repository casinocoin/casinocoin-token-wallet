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
        let win = new BrowserWindow({ width: 800, height: 700, icon: __dirname + '/favicon.ico' });
        win.on('closed', () => {
            win = null;
        });
        this.logger.debug('### Paperwallet - loadView');
        const loadView = ({ title, scriptUrl }) => {
            return (`
          <html>
            <head>
              <title>Paper Wallet</title>
              <style>
                .csc-logo{
                    width: 100px;
                    float: left;
                    position: relative;
                }
                .key_box{
                    width: 48%;
                    height: 310px;
                    float: left;
                    text-align: center;
                    border: 1px solid black;
                    margin: 2% 0 0 0;
                }
                .key_box1{
                    width: 48%;
                    height: 310px;
                    float: left;
                    text-align: center;
                    border: 1px solid black;
                    margin: 2% 0 0 0;
                }
              </style>
            </head>
            <body onload="window.print()" onfocus="window.close()">
            <p><img src="https://casinocoin.org/wp-content/uploads/2018/02/Chip_Red-3.svg" alt="CasinoCoin" class="csc-logo" /></p>
            <p></p>
            <h1 align="center">CasinoCoin Paper Wallet</h1>
            <p></p>
            <br><br>
            <h2>About</h2>
            <p>A CasinoCoin Paper Wallet is an offline mechanism for storing CasinoCoin. The process involves printing the public and private keys onto paper.</p>
            <p><strong>Disclaimer:</strong> Use of the CasinoCoin Paper Wallet Generator is offered solely to persons who are at least 18 years old. Your use of the Paper Wallet Generator is solely at your own risk, and you hereby agree to release CasinoCoin and its affiliates from any and all claims arising out of or in connection with your use of the Paper Wallet Generator or your Paper Wallet, including risk of loss of the Paper Wallet key(s) and any other damages whatsoever.</p>
            ${printContents}
            <div>
                <h2>Instructions</h2>
                <strong>Step 1. Generate New Address</strong><br>
                <p>Click on the "Generate New Address" button.<br>
                </p><br>
                <strong>Step 2. Print the Paper Wallet</strong><br>
                <p>Print the page using the high quality setting. Never save the page as a PDF file to print it later since a file is more likely to be hacked than a piece of paper.<br>
                </p><br>
                <strong>Step 3. Share your public address</strong><br>
                <p>Use your public address to receive CasinoCoin from other users. You can share your public address as much as you want.<br>
                </p><br>
                <strong>Step 4. Keep your private key secret</strong><br>
                <p>The private key is literally the keys to your coins. If someone were to obtain it, they could withdraw the funds currently in the wallet, and any funds that might be deposited in that wallet.<br>
                </p><br>
                <p>Please test sending a small amount before receiving any large payments. You can check the balance of your wallet using your public address here: https://explorer.casinocoin.org/<br></p>
            </div>
            </body>
          </html>`);
        };
        const file = 'data:text/html;charset=UTF-8,' + encodeURIComponent(loadView({
            title: 'PaperWallet',
            scriptUrl: './paperWallet.view.js'
        }));
        win.setMenu(null);
        win.loadURL(file);
    }

    instructions() {
        this.showInstructions = true;
    }

}
