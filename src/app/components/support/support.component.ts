import { Component, OnInit } from '@angular/core';
import { LogService } from '../../providers/log.service';
import { AppConstants } from '../../domains/app-constants';
import { ElectronService } from '../../providers/electron.service';

@Component({
  selector: 'app-support',
  templateUrl: './support.component.html',
  styleUrls: ['./support.component.scss']
})
export class SupportComponent implements OnInit {

  constructor(private logger: LogService,
              private electronService: ElectronService) {
          this.logger.debug('### INIT Support ###');
  }

  ngOnInit() {

  }

  openFAQ() {
    event.preventDefault();
    this.electronService.remote.shell.openExternal('https://casinocoin.org/faq/');
  }

  openReddit() {
    event.preventDefault();
    this.electronService.remote.shell.openExternal('https://www.reddit.com/r/casinocoin/');
  }

  openDiscord() {
    event.preventDefault();
    this.electronService.remote.shell.openExternal('http://casinocoin.chat/');
  }

  openWebsite() {
    event.preventDefault();
    this.electronService.remote.shell.openExternal('https://casinocoin.org');
  }

  openGithub() {
    event.preventDefault();
    this.electronService.remote.shell.openExternal('https://github.com/casinocoin/casinocoin-token-wallet/issues');
  }

  openContactForm() {
    event.preventDefault();
    this.electronService.remote.shell.openExternal('https://casinocoin.org/contact');
  }

  openEmail() {
    event.preventDefault();
    this.electronService.remote.shell.openExternal('mailto:support@casinocoin.org');
  }

  openFacebook() {
    event.preventDefault();
    this.electronService.remote.shell.openExternal('https://www.facebook.com/CasinoCoin/');
  }

  openTwitter() {
    event.preventDefault();
    this.electronService.remote.shell.openExternal('https://twitter.com/CasinoCoin');
  }

  openBitcoinTalk() {
    event.preventDefault();
    this.electronService.remote.shell.openExternal('https://bitcointalk.org/index.php?topic=3262543.0');
  }
}
