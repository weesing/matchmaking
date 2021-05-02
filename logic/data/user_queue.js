import _ from 'lodash';
import moment from 'moment';

export class UserQueue {
  constructor() {
    this._queue = [];
  }

  get queue() {
    return this._queue;
  }

  calculateUserScore(user) {
    let wins = (user.wins =
      _.isNil(user.wins) || user.wins === 0 ? 1 : user.wins);
    let losses = (user.losses =
      _.isNil(user.losses) || user.losses === 0 ? 1 : user.losses);

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

    score = Math.min(score, Number.MAX_SAFE_INTEGER);
    user.wins = Math.min(wins, Number.MAX_SAFE_INTEGER);
    user.losses = Math.min(losses, Number.MAX_SAFE_INTEGER);

    user.score = score;
  }

  enqueue(user, insert = false) {
    const _user = _.cloneDeep(user);
    if (!_user.score) {
      this.calculateUserScore(_user);
    }
    if (!_user.queueTime) {
      _user.queueTime = moment().unix();
    }
    console.log(
      `User ${_user.name} joined the queue (W:${_user.wins}/L:${_user.losses}/Score:${_user.score}/QueueTime:${_user.queueTime})`
    );
    if (!insert) {
      this._queue.push(_user);
    } else {
      this._queue.unshift(_user);
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
