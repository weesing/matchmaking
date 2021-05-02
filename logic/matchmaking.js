import _ from 'lodash';
import moment from 'moment';
import config from 'config';
import { MatchMakingState, STATUS_FINALIZED } from './data/matchmaking_state';
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

  /**
   * Build a match by forming a placeholder team with a seed team dequeued from the team buckets queue.
   * @returns {string} ID of the newly form match.
   */
  async findNextMatch() {
    // Get the seed team bucket
    const teamBucket = this.matchMakingState.dequeueTeam();
    if (teamBucket) {
      console.log(`Match-making for team ${teamBucket.bucketId}`);
      let matchId = this.matchMakingState.createMatchBucket(
        teamBucket.bucketId
      );
      // Start the recursive call to find matching teams
      let match = await this.tryFindMatch({ matchId });
      if (_.isNil(match)) {
        // No matching teams found. Requeue the teams.
        console.log(`Can't find match. Requeuing teams.`);
        this.matchMakingState.clearMatch(matchId, true);
        return null;
      }
      return matchId;
    }
    return null;
  }

  /**
   * Auxiliary recursive method used by findNextMatch() to build a match. Each recursion increases the scoreTolerance
   * which expands the tolerance level for matching up teams.
   *
   * @param {object} param0
   */
  async tryFindMatch({ matchId, scoreTolerance } = {}) {
    let result = null;
    const match = this.matchMakingState.getMatch(matchId);
    if (match.teamBuckets.length >= 2 || match.status === STATUS_FINALIZED) {
      // Already finalized, this shouldn't be called.
      console.warn(match, `Match already finalized and have enough teams.`);
      return match;
    }

    const homeTeam = match.teamBuckets[0];
    if (homeTeam) {
      const homeTeamScore = homeTeam.avgScore;
      if (_.isNil(scoreTolerance)) {
        // No tolerance given. Setup the initial tolerance (agressiveness / home team score)
        const agressiveness = config.get(
          'matchmaking.match_build.expansion.agressiveness'
        );
        scoreTolerance = agressiveness / homeTeamScore;
      }

      // Get all teams from queue
      const oppTeamBucketIds = this.matchMakingState.getTeamBucketQueue();
      for (const oppTeamBucketId of oppTeamBucketIds) {
        const oppTeam = this.matchMakingState.getTeamBucket(oppTeamBucketId);
        // Check all the criteria of opponent team.
        if (
          oppTeam.avgScore + scoreTolerance >= homeTeamScore &&
          oppTeam.avgScore - scoreTolerance <= homeTeamScore &&
          oppTeam.bucketId !== homeTeam.bucketId &&
          oppTeam.teamSize === homeTeam.teamSize // must match size
        ) {
          // Found a good match by score tolerance.
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
        // No match found, expand the search.
        scoreTolerance += scoreTolerance;
        const minScoreTolerance = config.get(
          'matchmaking.match_build.expansion.min_score_tolerance'
        );
        if (scoreTolerance < Math.max(homeTeamScore, minScoreTolerance)) {
          // Recursive call with increased score tolerance
          result = this.tryFindMatch({
            matchId,
            scoreTolerance,
          });
        }
      }
    }
    return result;
  }

  /**
   * Build a team by forming a placeholder team with a seed user. Team building will do attempts
   * with different team sizes. If all else fails, build single user team when seed user has already
   * been queuing for more than a certain time threshold.
   *
   * @returns {string} Team bucket ID. If no team was formed (including single user team), null is returned.
   */
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
          `Failed to build team of size ${teamSize} with seed user ${seedUser.name}. Clearing bucket ID ${bucketId} and requeueing users other than seed user.`
        );
        this.matchMakingState.clearTeamBucket(bucketId);
      } else {
        // Successfully built a team
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
      console.warn(
        `Forming single user team for ${seedUser.name} after failing to form a team after ${singleUserTeamThreshold}s`
      );
      let bucketId = this.matchMakingState.createTeamBucket(seedUser, 1);
      return bucketId;
    }

    // Cannot form team
    // Put seed user back into the queue.
    console.log(`Exhausted team build, requeueing seed user ${seedUser.name}`);
    this.matchMakingState.enqueueUser(seedUser);
    return null;
  }

  /**
   * Auxiliary recursive method used by buildTeam to build a team. Each recursion increases the scoreTolerance
   * which expands the tolerance level for matching until a team is built OR tolerance have reached maximum cap.
   * If tolerance reaches maximum cap, no team is built.
   *
   * @param {object} param0
   * @returns {int} Number of users gathered in the team. null if no team is formed.
   */
  async tryBuildTeam({ bucketId, scoreTolerance, agressiveness }) {
    const teamBucket = this.matchMakingState.getTeamBucket(bucketId);
    const teamSize = teamBucket.teamSize;
    if (teamBucket.users.size >= teamSize) {
      return teamBucket.users.size;
    }

    if (scoreTolerance && scoreTolerance >= teamBucket.scoreToleranceMax) {
      console.warn(
        `Cannot form a team for these users, tolerance is up to ${scoreTolerance}! Putting them back into the queue.`
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
        `Found a next user with tolerance ${scoreTolerance} ${nextUser.name}`
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

  /**
   * Get match by ID. Omit the match ID to get all matches.
   * @param {string} matchId Optional match ID.
   */
  async getMatches(matchId) {
    return this.matchMakingState.getMatch(matchId);
  }

  /**
   * Get a single team bucket by ID, or all team buckets in the team pool by omitting the ID input.
   * @param {string} bucketId Optional team bucket ID.
   */
  async getTeamBucket(bucketId = '') {
    if (!_.isEmpty(bucketId)) {
      // get single
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

  /**
   * Get team buckets in the team queue.
   */
  async getTeamQueue() {
    const bucketIds = this.matchMakingState.getTeamBucketQueue();
    const teams = bucketIds.map(async (bucketId) => {
      const teamBucket = await this.getTeamBucket(bucketId);
      return teamBucket;
    });
    return Promise.all(teams);
  }

  /**
   * Get users in the user queue.
   */
  async getUserQueue() {
    return this.matchMakingState.getUserQueue();
  }
}
