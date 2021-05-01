import _ from 'lodash';
import { UserState } from './data/user_state';

export class UsersLogic {
  constructor() {
    this.userState = UserState.getInstance();
  }

  formatUsers(usersList) {
    const usersMap = {};
    for (const user of usersList) {
      usersMap[user.name] = Object.assign(
        {},
        _.pick(user, ['name', 'wins', 'losses'])
      );
    }
    return usersMap;
  }

  getUsers() {
    return this.userState.users;
  }

  async getUsersByNames(names) {
    const users = await this.getUsers();
    const usersMap = this.formatUsers(users);
    const results = _.pick(usersMap, names);
    return results;
  }
}
