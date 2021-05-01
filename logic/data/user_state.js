import path from 'path';
import config from 'config';

export class UserState {
  static getInstance() {
    if (!this._instance) {
      this._instance = new UserState();
      const dataFile = path.join(__dirname, config.get('user.data.file'));
      this._instance.users = require(dataFile);
      console.log(`Loaded users ---- ${this._instance.users.length}`);
    }
    return this._instance;
  }

  getUsers() {
    return this._instance.users;
  }
}