import _ from 'lodash';
import moment from 'moment';
import config from 'config';
import { v4 } from 'uuid';
import { UsersLogic } from '../users';
import { UserQueue } from './user_queue';

export const STATUS_FORMING = 'forming';
export const STATUS_FINALIZED = 'finalized';
export const STATUS_DELETING = 'deleting';

/**
 * This class holds all the states related to matchmaking.
 *
 * Concepts:
 * - There are 2 pools (team, match) and 2 queues (user, team)
 * - Teams & Matches exists within their respective pools (not to be confused with the queues).
 *
 * User Queue
 * - Users who join the match-making system will be queued up in this queue.
 * - Users will be removed from user queue and put into teams if he/she manage to form a team with other users.
 * Team Pool
 * - Users that forms a pool will create a team 'bucket'.
 * - Each team bucket will be added to the team pool when the number of users have reached the intended team
 * size in the team bucket.
 * - After the team is finalized, the team bucket will be added to the Team queue (note that this does not remove
 * from the team pool).
 * Team Queue
 * - This is the queue containing finalized teams.
 * - Match-making logic will retrieve teams from this queue to form matches.
 * - Adding team buckets into the team queue does NOT remove from the team pool.
 * - Teams are removed from the queue when they have been match-made into a match.
 * Match Pool
 * - Team buckets that match up (team scores and sizes passes the criteria) will form a match and put
 * into this pool.
 * - These teams will be removed from the team queue.
 */
export class MatchMakingState {
  static getInstance() {
    if (!this._instance) {
      this._instance = new MatchMakingState();
      this._instance._teamBucketPool = {}; // teams pool
      this._instance._teamBucketQueue = []; // teams queue
      this._instance._matchBuckets = {}; // matches pool
      this._instance._usersQueue = new UserQueue(); // users queue
      this._instance._debugIntervalId = setInterval(() => {
        console.log(`Users in queue - ${this._instance.getUserQueue().length}`);
      }, 2000);
    }
    return this._instance;
  }

  printQueue() {
    console.table(this._usersQueue.queue);
  }

  /**
   * Loads and initializes a user queue.
   */
  async loadQueue() {
    const usersLogic = new UsersLogic();
    
    // TODO: Get all users and put into the queue
    const users = usersLogic.getUsers();
    for (let user of users) {
      this.enqueueUser(user);
    }
    console.log(
      `Loaded ${this._usersQueue.queue.length} users into the match-making queue`
    );
    this.printQueue();
  }

  /**
   * Retrieves all team buckets from the team bucket pool.
   */
  getAllTeamBuckets() {
    return _.cloneDeep(Object.values(this._teamBucketPool));
  }

  /**
   * Create a team bucket based on a seed user.
   * @param {object} seedUser - Seed/initial user
   * @param {int} teamSize - Expected size of team
   * @returns {string} The ID of the team bucket.
   */
  createTeamBucket(seedUser, teamSize) {
    const bucketId = v4();
    const status = teamSize === 1 ? STATUS_FINALIZED : STATUS_FORMING;
    this._teamBucketPool[bucketId] = {
      bucketId,
      seedUser,
      teamSize,
      avgScore: seedUser.score,
      scoreToleranceMax: Math.max(
        config.get('matchmaking.team_build.expansion.min_score_tolerance'),
        Math.min(seedUser.score, Number.MAX_SAFE_INTEGER)
      ),
      status,
      users: new Set([seedUser]),
    };
    if (status === STATUS_FINALIZED) {
      // queue the team for match making
      this.enqueueTeam(bucketId);
    }
    return bucketId;
  }

  /**
   * Removes & destroys a team bucket from the team bucket pool
   * @param {string} bucketId
   * @returns
   */
  removeBucketFromTeamPool(bucketId) {
    delete this._teamBucketPool[bucketId];
  }

  /**
   * Gets a team bucket by ID.
   * @param {string} bucketId
   * @returns - The team bucket identified by bucketId
   */
  getTeamBucket(bucketId) {
    return _.cloneDeep(this._teamBucketPool[bucketId]);
  }

  /**
   * Add a single user object into the team bucket. User will be removed from the user queue.
   *
   * If the expected team size has reached after addition, the team status will be set to finalized
   * and enqueued into the team match-making queue.
   *
   * @param {string} bucketId - ID of the team bucket.
   * @param {object} user - The user to add to bucket.
   */
  async addUserToTeamBucket(bucketId, user) {
    const team = this._teamBucketPool[bucketId];
    if (team) {
      team.users.add(user);
      // remove from queue
      this.removeUsersFromQueue([user.name]);
    }
    if (team.users.size >= team.teamSize) {
      team.status = STATUS_FINALIZED;
      // queue the team for match making
      this.enqueueTeam(team.bucketId);
    }
    const users = [...team.users];
    // Re-calculate the team average score.
    team.avgScore = _.sumBy(users, (user) => user.score) / users.length;
    return this._teamBucketPool[bucketId].users;
  }

  /**
   * Clear a team bucket off it's users and put team members (except the seed user) 
   * back into the user queue.
   * 
   * Will remove and destroy the team bucket from the team bucket pool as well.
   * @param {string} bucketId
   */
  clearTeamBucket(bucketId) {
    this._teamBucketPool[bucketId].status = STATUS_DELETING;
    const mmBucket = this._teamBucketPool[bucketId];
    const users = [...mmBucket.users];
    // requeue all users
    for (const user of users) {
      if (user.name === mmBucket.seedUser.name) {
        continue;
      }
      this.enqueueUser(user);
    }
    this.removeBucketFromTeamPool(bucketId);
  }

  /**
   * Shifts a team bucket ID off the team match-making queue.
   * @returns {string} Bucket ID. Returns null if queue is empty.
   */
  dequeueTeam() {
    const bucketId = this._teamBucketQueue.shift();
    if (bucketId) {
      return this._teamBucketPool[bucketId];
    } else {
      return null;
    }
  }

  /**
   * Puts a team bucket into the team match-making queue.
   * @param {string} teamBucketId
   */
  enqueueTeam(teamBucketId) {
    const team = this._teamBucketPool[teamBucketId];
    if (!team.enqueueTime) {
      team.enqueueTime = moment().unix();
    }
    if (team) {
      this._teamBucketQueue.push(team.bucketId);
    }
  }

  /**
   * Removes a team bucket from the team match-making queue.
   * @param {string} teamBucketId
   * @returns {boolean} - Whether a removal was performed.
   */
  removeTeamBucketFromQueue(teamBucketId) {
    for (let i = 0; i < this._teamBucketQueue.length; ++i) {
      if (this._teamBucketQueue[i] === teamBucketId) {
        this._teamBucketQueue.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  /**
   * Get the team match-making queue.
   */
  getTeamBucketQueue() {
    return this._teamBucketQueue;
  }

  /**
   * Get the user match-making queue.
   */
  getUserQueue() {
    return this._usersQueue.queue;
  }

  /**
   * Shifts an oldest user from the user queue.
   * @returns {object} - Oldest user in the queue. Null if queue is empty
   */
  dequeueUser() {
    const firstUser = this._usersQueue.queue.shift();
    if (firstUser) {
      console.log(
        `Dequeueing user ${firstUser.name}, users left in queue - ${this._usersQueue.queue.length}`
      );
    } else {
      console.log(`No more users in queue`);
    }
    return firstUser;
  }

  /**
   * Puts a user into the tail of the user queue.
   * @param {object} user
   */
  enqueueUser(user) {
    this._usersQueue.enqueue(user);
    console.log(`Enqueueing user ${user.name}`);
  }

  /**
   * Removes a list of user by usernames from the user queue.
   * @param {[string]} usernames
   */
  removeUsersFromQueue(usernames) {
    for (const username of usernames) {
      console.log(`Removing ${username}`)
      this._usersQueue.removeUser(username);
    }
  }

  /**
   * Creates a new match with initial team bucket.
   * @param {string} teamBucketId
   * @returns {string} The ID of the match. Can return null if the team bucket cannot be found in the pool.
   */
  createMatchBucket(teamBucketId) {
    const teamBucket = this._teamBucketPool[teamBucketId];
    if (teamBucket) {
      let matchId = v4();
      this._matchBuckets[matchId] = {
        matchId,
        teamSize: teamBucket.teamSize,
        teamBuckets: [teamBucket],
        status: STATUS_FORMING,
      };
      return matchId;
    }
    return null;
  }

  /**
   * Get match bucket from match ID.
   * @param {string} matchId
   * @returns {object} - Match bucket object.
   */
  getMatch(matchId) {
    if (!_.isNil(matchId)) {
      return this._matchBuckets[matchId];
    } else {
      return Object.values(this._matchBuckets);
    }
  }

  /**
   * Add a new team (newTeamBucketId) into the match indicated by matchId. Addition can fail due
   * to number of teams have been fulfilled in match or match status is marked as finalized, or
   * if the team size does not match the existing team in the match.
   * @param {string} matchId
   * @param {string} newTeamBucketId
   * @returns {boolean} Indicates whether the addition was successful.
   */
  addTeamBucketIdToMatch(matchId, newTeamBucketId) {
    const match = this.getMatch(matchId);
    if (match) {
      if (match.teamBuckets.length >= 2 || match.status === STATUS_FINALIZED) {
        return false;
      }

      const homeTeam = match.teamBuckets[0];
      const oppTeam = this._teamBucketPool[newTeamBucketId];
      if (oppTeam.teamSize !== homeTeam.teamSize) {
        return false;
      }

      this.removeTeamBucketFromQueue(newTeamBucketId);

      match.teamBuckets.push(oppTeam);
      match.status = STATUS_FINALIZED;
    }
    return true;
  }

  /**
   * Clears & destroys the match from the match bucket pool
   * @param {string} matchId - ID of the match to clear
   * @param {boolean} putBackTeamPool - Indicates whether to put team buckets in the match back into the queue.
   * @returns {object} The deleted match bucket.
   */
  clearMatch(matchId, putBackTeamPool = false) {
    const match = this.getMatch(matchId);
    if (match) {
      if (putBackTeamPool) {
        const homeTeamBucket = match.teamBuckets[0];
        if (homeTeamBucket) {
          this.enqueueTeam(homeTeamBucket.bucketId);
        }
        const oppTeamBucket = match.teamBuckets[1];
        if (oppTeamBucket) {
          this.enqueueTeam(oppTeamBucket.bucketId);
        }
      }
    }
    delete this._matchBuckets[matchId];
    return match;
  }
}
