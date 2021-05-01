import config from 'config';
import express from 'express';
import {
  MatchMakingLogic,
  MATCH_MAKING_3v3,
  MATCH_MAKING_5v5,
} from '../logic/matchmaking';
import { formatPrintUsers } from '../logic/misc';
var router = express.Router();

router.get('/', async function (req, res, next) {
  const matchMakingLogic = new MatchMakingLogic();
  let mmBucket = await matchMakingLogic.findNextMatch();
  if (mmBucket === undefined) {
    console.log('****** No match made... ******');
    res.sendStatus(204);
  } else {
    console.log('****** Match made! ******');
    mmBucket.users = [...mmBucket.users];
    formatPrintUsers(mmBucket.users);
    res.send(mmBucket);
  }
});

router.get('/queue', async function (req, res, next) {
  const matchMakingLogic = new MatchMakingLogic();
  res.send(await matchMakingLogic.getUserQueue());
});

export default router;
