import express from 'express';
import { MatchMakingLogic, MATCH_MAKING_3v3 } from '../logic/matchmaking';
import { formatPrintUsers } from '../logic/misc';
var router = express.Router();

router.get('/', async function (req, res, next) {
  const matchMakingLogic = new MatchMakingLogic(MATCH_MAKING_3v3);
  let mmBucket = await matchMakingLogic.findNextMatch();
  let tries = 2;
  while (mmBucket === undefined) {
    // try again
    console.log(`Try ${tries}`);
    mmBucket = await matchMakingLogic.findNextMatch();
    ++tries;
    if (tries > 10) {
      break;
    }
  }
  console.log(`After ${tries} tries`);
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

export default router;
