import config from 'config';
import { MatchMakingLogic } from "./logic/matchmaking";
import { MatchMakingState } from "./logic/data/matchmaking_state";

export async function boot() {

  const matchMakingState = MatchMakingState.getInstance();
  await matchMakingState.loadQueue();

  const matchMakingLogic = new MatchMakingLogic();

  setInterval(() => {
    matchMakingLogic.buildTeam();
  }, config.get('matchmaking.team_build.interval_ms'));
  setInterval(() => {
    matchMakingLogic.findNextMatch();
  }, config.get('matchmaking.match_build.interval_ms'));
}