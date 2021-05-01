import _ from 'lodash';

export class UserQueue {
  constructor() {
    this._queue = [];
  }

  get queue() {
    return this._queue;
  }

  calculateUserScore(user) {
    let wins = _.isNil(user.wins) || user.wins === 0 ? 1 : user.wins;
    let losses = _.isNil(user.losses) || user.losses === 0 ? 1 : user.losses;
    let score = 0;
    if (wins < 0 || losses < 0) {
      // For corrupted data
      console.warn(
        `*********** User ${user.name} has corrupted win/loss stats ${wins}/${losses}`
      );
      score = Number.MAX_SAFE_INTEGER;
    } else {
      score = (wins / losses) * 1000;
    }

    user.score = score;
  }

  enqueue(user, insert = false) {
    this.calculateUserScore(user);
    console.log(
      `User ${user.name} joined the queue (W:${user.wins}/L:${user.losses}/Score:${user.score})`
    );
    if (!insert) {
      this._queue.push(user);
    }
    else {
      this._queue.unshift(user);
    }
  }

  removeUser(username) {
    for (let i = 0; i < this.queue.length; ++i) {
      const user = this.queue[i];
      if (user.name === username) {
        this.queue.splice(i, 1);
        return user;
      }
    }
  }
}
