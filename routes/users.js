import express from 'express';
import UsersLogic from '../logic/users';
var router = express.Router();

/* GET users listing. */
router.get('/', async function (req, res, next) {
  const usersLogic = new UsersLogic();
  const users = await usersLogic.getUsersByWinParams(req.parsedParams);
  res.send(users);
});

module.exports = router;
