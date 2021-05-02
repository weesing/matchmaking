import _ from 'lodash';
import express from 'express';
import { MatchMakingLogic } from '../logic/matchmaking';
var router = express.Router();

router.post('/matches', async function (req, res, next) {
  const matchMakingLogic = new MatchMakingLogic();
  let matchId = await matchMakingLogic.findNextMatch();
  if (matchId === null) {
    res.sendStatus(204);
    return;
  }
  let match = await matchMakingLogic.getMatches(matchId);
  console.log(match);
  for (const team of match.teamBuckets) {
    team.users = [...team.users];
  }
  res.send(match);
});

router.get('/matches', async function (req, res, next) {
  const matchMakingLogic = new MatchMakingLogic();
  const matches = await matchMakingLogic.getMatches();
  for (const match of matches) {
    for (const team of match.teamBuckets) {
      team.users = [...team.users];
    }
  }
  res.send({
    count: matches.length,
    matches,
  });
});

router.post('/team', async function (req, res, next) {
  const matchMakingLogic = new MatchMakingLogic();
  const teamBucketId = await matchMakingLogic.buildTeam();
  if (teamBucketId !== null) {
    const teamBucket = await matchMakingLogic.getTeamBucket(teamBucketId);
    res.send(teamBucket);
  } else {
    res.sendStatus(204);
  }
});

router.get('/users/queue', async function (req, res, next) {
  const matchMakingLogic = new MatchMakingLogic();
  const queue = await matchMakingLogic.getUserQueue();
  console.table(queue);
  res.send({
    count: queue.length,
    users: queue,
  });
});

router.get('/team', async function (req, res, next) {
  const matchMakingLogic = new MatchMakingLogic();
  const teams = await matchMakingLogic.getTeamBucket();
  console.table(teams);
  const result = {
    count: teams.length,
    teams,
  };
  res.send(result);
});

router.get('/team/queue', async function (req, res, next) {
  const matchMakingLogic = new MatchMakingLogic();
  const teams = await matchMakingLogic.getTeamQueue();
  res.send({
    count: teams.length,
    teams,
  });
});

export default router;
