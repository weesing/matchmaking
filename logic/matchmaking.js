import _ from 'lodash';
import config from 'config';
import { MatchMakingState } from './data/matchmaking_state';
import { UsersLogic } from './users';
import { formatPrintUsers } from './misc';

export const MATCH_MAKING_3v3 = 6;
export const MATCH_MAKING_5v5 = 10;

export class MatchMakingLogic {
  constructor(mode = MATCH_MAKING_3v3) {
    const matchMakingModes = new Set([MATCH_MAKING_3v3, MATCH_MAKING_5v5]);
    if (!matchMakingModes.has(mode)) {
      throw new Error(`Unknown mode ${mode}`);
    }
    this.mode = mode;
    this.usersLogic = new UsersLogic();
    this.matchMakingState = MatchMakingState.getInstance();
  }

  async findNextMatch() {
    // Get first user
    const firstUser = this.matchMakingState.dequeueUser();
    let bucketId = this.matchMakingState.createMatchMakeBucket(firstUser);
    console.log(
      `+++++ Finding match from user '${firstUser.name}, bucket created ${bucketId}`
    );
    let nbUsers = await this.findMatch({
      bucketId,
      matchedUsers: [firstUser],
    });

    if (nbUsers === null) {
      // didn't find a match for the first/seed user.
      console.log(`No match found. Clearing bucket ID ${bucketId}`);
      this.matchMakingState.clearMatchMadeBucket(bucketId);
      console.log('Current queue');
      console.table(this.matchMakingState.getUserQueue());
    }

    return this.matchMakingState.getMatchMakeBucket(bucketId);
  }

  async findMatch({ bucketId, matchScoreAvg = -1, scoreTolerance }) {
    const nbUsers = this.mode;
    const mmBucket = this.matchMakingState.getMatchMakeBucket(bucketId);
    if (mmBucket.users.size >= nbUsers) {
      return mmBucket.users.size;
    }

    if (scoreTolerance && scoreTolerance >= 5000) {
      console.warn(
        `Cannot find anymore matches for these users, tolerance is up to ${scoreTolerance}! Putting them back into the queue.`
      );
      formatPrintUsers([...mmBucket.users]);
      return null;
    }
    if (_.isNil(scoreTolerance)) {
      console.table([...mmBucket.users]);
      let firstUserScore = mmBucket.seedUser.score;
      scoreTolerance =
        config.get('matchmaking.expansion.factor') / firstUserScore;
      console.info(`Calculated initial tolerance ${scoreTolerance}`);
    }

    if (matchScoreAvg < 0) {
      matchScoreAvg = mmBucket.seedUser.score;
    }

    // Get current queue
    let usersPool = this.matchMakingState.getUserQueue();
    console.log(`Left ${usersPool.length} users in queue`);

    let nextUser = null;
    for (let i = 0; i < usersPool.length; ++i) {
      const thisUser = usersPool[i];
      if (
        thisUser.score >= matchScoreAvg + scoreTolerance ||
        thisUser.score <= matchScoreAvg - scoreTolerance
      ) {
        continue;
      }
      nextUser = thisUser;
      console.log(
        `------- Found a next user with tolerance ${scoreTolerance} ${nextUser.name}`
      );
      const usersSet = await this.matchMakingState.addMatchMadeUser(
        bucketId,
        nextUser
      );

      if (usersSet.size >= nbUsers) {
        return usersSet.size;
      }
    }

    console.log(`------ Current match`);
    formatPrintUsers([...mmBucket.users]);
    scoreTolerance += scoreTolerance; // increment range
    console.log(`Increasing tolerance to ${scoreTolerance}`);
    matchScoreAvg =
      _.sumBy([...mmBucket.users], (user) => user.score) / mmBucket.users.size;

    return this.findMatch({
      bucketId,
      matchScoreAvg,
      scoreTolerance,
    });
  }
}
