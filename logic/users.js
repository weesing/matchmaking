import _ from 'lodash';
import config from 'config';
import path from 'path';

export default class UsersLogic {
  async formatUsers(usersList) {
    const usersMap = {};
    for (const user of usersList) {
      usersMap[user.name] = _.pick(user, ['wins', 'losses']);
    }
    return usersMap;
  }

  async getUsers() {
    const dataFile = path.join(__dirname, config.get('user.data.file'));
    let users = require(dataFile);
    return users;
  }

  async getUsersByWinParams({ winLow, winHigh }) {
    const results = [];
    let users = await this.getUsers();
    users = _.filter(users, (user) => {
      if (!_.isNil(winLow) && !_.isNil(winHigh)) {
        if (user.wins >= winLow && user.wins <= winHigh) {
          results.push(user);
        }
      } else if (!_.isNil(winLow)) {
        if (user.wins >= winLow) {
          results.push(user);
        }
      } else if (!_.isNil(winHigh)) {
        if (user.wins <= winHigh) {
          results.push(user);
        }
      }
    });
    return this.formatUsers(results);
  }
}
