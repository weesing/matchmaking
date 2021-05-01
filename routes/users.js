import express from 'express';
import { UsersLogic } from '../logic/users';
var router = express.Router();

/* GET users listing. */
router.get('/', async function (req, res, next) {
  const usersLogic = new UsersLogic();
  const users = await usersLogic.getUsers(req.parsedParams);
  res.send(users);
});

export default router;
