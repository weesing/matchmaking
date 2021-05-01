import _ from 'lodash';
import { v4 } from 'uuid';
import { UsersLogic } from '../users';
import { UserQueue } from './user_queue';

export class MatchMakingState {
  static getInstance() {
    if (!this._instance) {
      this._instance = new MatchMakingState();
      this._instance._matchMadeBuckets = {};
      this._instance._matchMakingQueue = null;
      this._instance.loadQueue();
      this._instance._debugIntervalId = setInterval(() => {
        console.log(`Users in queue - ${this._instance.getUserQueue().length}`);
      }, 2000);
    }
    return this._instance;
  }

  printQueue() {
    console.table(this._matchMakingQueue.queue);
  }

  async loadQueue() {
    const usersLogic = new UsersLogic();
    // TODO: Get all users and put into the queue
    this._matchMakingQueue = new UserQueue();
    const users = usersLogic.getUsers();
    for (let user of users) {
      this.enqueueUser(user);
    }
    console.log(
      `Loaded ${this._matchMakingQueue.queue.length} users into the match-making queue`
    );
    this.printQueue();
  }

  createMatchMakeBucket(seedUser) {
    const bucketId = v4();
    this._matchMadeBuckets[bucketId] = { seedUser, users: new Set([seedUser]) };
    return bucketId;
  }

  deleteMatchMakeBucket(bucketId) {
    delete this._matchMadeBuckets[bucketId];
  }

  getMatchMakeBucket(bucketId) {
    return this._matchMadeBuckets[bucketId];
  }

  async addMatchMadeUser(bucketId, user) {
    if (this._matchMadeBuckets[bucketId]) {
      this._matchMadeBuckets[bucketId].users.add(user);
      // remove from queue
      this.removeUsersFromQueue([user.name]);
    }
    return this._matchMadeBuckets[bucketId].users;
  }

  async clearMatchMadeBucket(bucketId) {
    const mmBucket = this._matchMadeBuckets[bucketId];
    const users = [...mmBucket.users];
    // requeue all users
    for(const user of users) {
      this.enqueueUser(user);
    }
    this.deleteMatchMakeBucket(bucketId);
  }

  getUserQueue() {
    return this._matchMakingQueue.queue;
  }

  dequeueUser() {
    const firstUser = this._matchMakingQueue.queue.shift();
    console.log(`Dequeueing user ${firstUser.name}`);
    return firstUser;
  }

  enqueueUser(user) {
    this._matchMakingQueue.enqueue(user);
    console.log(`Enqueueing user ${user.name}`);
  }

  removeUsersFromQueue(usernames) {
    for (const username of usernames) {
      this._matchMakingQueue.removeUser(username);
    }
  }
}
