import _ from 'lodash';
import moment from 'moment';
import config from 'config';
import { MatchMakingState } from './data/matchmaking_state';
import { UsersLogic } from './users';
import { formatPrintUsers } from './misc';

export const TEAM_SIZE_3 = 3;
export const TEAM_SIZE_5 = 5;

/**
 * This class holds all the logic related to matchmaking.
 *
 * Concepts:
 * - There are 2 pools (team, match) and 2 queues (user, team)
 * - Teams & Matches exists within their respective pools (not to be confused with the queues).
 * - These entities exist in the match making state of the logic (this.matchMakingState)
 * - See documentation in matchmaking_state.js for explanation of entities.
 *
 * Intervals:
 * - Team forming interval: Runs periodically to consume users from the user queue to form teams.
 * - Match-making interval: Runs periodically to match-make team buckets into matches.
 */
export class MatchMakingLogic {
  constructor() {
    this.usersLogic = new UsersLogic();
    this.matchMakingState = MatchMakingState.getInstance();
  }

  async findNextMatch() {
    const teamBucket = this.matchMakingState.dequeueTeam();
    if (teamBucket) {
      console.log(`Match-making for team ${teamBucket.bucketId}`);
      let matchId = this.matchMakingState.createMatchBucket(
        teamBucket.bucketId
      );
      let match = await this.tryFindMatch({ matchId });
      if (_.isNil(match)) {
        console.log(`Can't find match`);
        this.matchMakingState.clearMatch(matchId, true);
        return null;
      }
      return matchId;
    }
    return null;
  }

  async tryFindMatch({ matchId, scoreTolerance } = {}) {
    let result = null;
    const match = this.matchMakingState.getMatch(matchId);
    const homeTeam = match.teamBuckets[0];
    if (homeTeam) {
      const homeTeamScore = homeTeam.avgScore;
      if (_.isNil(scoreTolerance)) {
        const agressiveness = config.get(
          'matchmaking.match_build.expansion.agressiveness'
        );
        scoreTolerance = agressiveness / homeTeamScore;
      }
      const oppTeamBucketIds = this.matchMakingState.getTeamBucketQueue();
      for (const oppTeamBucketId of oppTeamBucketIds) {
        const oppTeam = this.matchMakingState.getTeamBucket(oppTeamBucketId);
        if (
          oppTeam.avgScore + scoreTolerance >= homeTeamScore &&
          oppTeam.avgScore - scoreTolerance <= homeTeamScore &&
          oppTeam.bucketId !== homeTeam.bucketId
        ) {
          const added = this.matchMakingState.addTeamBucketIdToMatch(
            matchId,
            oppTeam.bucketId
          );
          if (added) {
            console.log(match, `Found match!`);
            result = match;
            break;
          }
        }
      }

      if (_.isNil(result)) {
        // expand the search
        scoreTolerance += scoreTolerance;
        // console.log(`Increasing match build tolerance to ${scoreTolerance}`);
        const minScoreTolerance = config.get(
          'matchmaking.match_build.expansion.min_score_tolerance'
        );
        if (scoreTolerance < Math.max(homeTeamScore, minScoreTolerance)) {
          result = this.tryFindMatch({
            matchId,
            scoreTolerance,
          });
        }
      }
    }
    return result;
  }

  async getMatch(matchId) {
    return this.matchMakingState.getMatch(matchId);
  }

  async getMatches() {
    return this.matchMakingState.getMatch();
  }

  async getTeamBucket(bucketId = '') {
    if (!_.isEmpty(bucketId)) {
      const formattedTeams = this.matchMakingState.getTeamBucket(bucketId);
      formattedTeams.users = [...formattedTeams.users];
      return formattedTeams;
    } else {
      // get all
      const teamBuckets = this.matchMakingState.getAllTeamBuckets();
      const formattedTeams = [];
      for (const team of teamBuckets) {
        team.users = [...team.users];
        formattedTeams.push(team);
      }
      return formattedTeams;
    }
  }

  async buildTeam() {
    // Get first user
    const seedUser = this.matchMakingState.dequeueUser();
    if (!seedUser) {
      return null;
    }
    const teamSizeTrySeq = [TEAM_SIZE_5, TEAM_SIZE_3];
    for (const teamSize of teamSizeTrySeq) {
      let bucketId = this.matchMakingState.createTeamBucket(seedUser, teamSize);
      console.log(
        `+++++ Finding team from user '${seedUser.name}, team bucket created ${bucketId} with team size ${teamSize}`
      );

      let nbUsers = await this.tryBuildTeam({
        bucketId,
        matchedUsers: [seedUser],
        agressiveness: config.get(
          'matchmaking.team_build.expansion.agressiveness'
        ),
      });

      if (nbUsers === null) {
        // didn't find a match for the first/seed user.
        console.log(
          `No team found. Clearing bucket ID ${bucketId} and requeueing users.`
        );
        this.matchMakingState.clearTeamBucket(bucketId);
      } else {
        const teamBucket = this.matchMakingState.getTeamBucket(bucketId);
        console.log(
          `Built team`,
          _.pick(teamBucket, [
            'bucketId',
            'teamSize',
            'seedUser',
            'avgScore',
            'status',
          ])
        );
        console.table([...teamBucket.users]);
        return bucketId;
      }
    }

    // Can't form a team, let's try to put user in single user team depending on his last queue time
    const now = moment().unix();
    const singleUserTeamThreshold = config.get(
      'matchmaking.team_build.single_user_team_threshold_secs'
    );
    if (now - seedUser.queueTime >= singleUserTeamThreshold) {
      // Remove user from queue first
      this.matchMakingState.removeUsersFromQueue([seedUser.name]);
      console.log(
        `******** User ${seedUser.name} can't form a team with others after queueing for ${singleUserTeamThreshold}`
      );
      let bucketId = this.matchMakingState.createTeamBucket(seedUser, 1);
      return bucketId;
    }

    // Cannot form team
    return null;
  }

  async tryBuildTeam({ bucketId, scoreTolerance, agressiveness }) {
    const teamBucket = this.matchMakingState.getTeamBucket(bucketId);
    const teamSize = teamBucket.teamSize;
    if (teamBucket.users.size >= teamSize) {
      return teamBucket.users.size;
    }

    if (scoreTolerance && scoreTolerance >= teamBucket.scoreToleranceMax) {
      console.warn(
        `Cannot find anymore matches for these users, tolerance is up to ${scoreTolerance}! Putting them back into the queue.`
      );
      formatPrintUsers([...teamBucket.users]);
      return null;
    }
    if (_.isNil(scoreTolerance)) {
      let firstUserScore = teamBucket.seedUser.score;
      scoreTolerance = agressiveness / firstUserScore;
      console.info(`Calculated initial tolerance ${scoreTolerance}`);
    }

    // Get current queue
    let usersPool = this.matchMakingState.getUserQueue();
    // console.log(`Left ${usersPool.length} users in queue`);

    let nextUser = null;
    for (let i = 0; i < usersPool.length; ++i) {
      const thisUser = usersPool[i];
      if (
        thisUser.score >= teamBucket.avgScore + scoreTolerance ||
        thisUser.score <= teamBucket.avgScore - scoreTolerance
      ) {
        continue;
      }
      nextUser = thisUser;
      console.log(
        `------- Found a next user with tolerance ${scoreTolerance} ${nextUser.name}`
      );
      const usersSet = await this.matchMakingState.addUserToTeamBucket(
        bucketId,
        nextUser
      );

      if (usersSet.size >= teamSize) {
        return usersSet.size;
      }
    }

    scoreTolerance += scoreTolerance; // increment range

    return this.tryBuildTeam({
      bucketId,
      scoreTolerance,
      agressiveness,
    });
  }

  async getTeamQueue() {
    const bucketIds = this.matchMakingState.getTeamBucketQueue();
    const teams = bucketIds.map(async (bucketId) => {
      const teamBucket = await this.getTeamBucket(bucketId);
      return teamBucket;
    });
    return Promise.all(teams);
  }

  async getUserQueue() {
    return this.matchMakingState.getUserQueue();
  }
}
