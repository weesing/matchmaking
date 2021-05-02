# Before you run
1) Make sure you have NodeJs `12.7.0` installed. You can check your version by running `node -v` command.
2) You can get NodeJs from https://nodejs.org/en/download/

# How to run
1) After ensuring NodeJs is installed, navigate to the root of the project folder.
2) Run `npm install` to install all the required package dependencies
3) Run `node index`

## Ensure your service started up
After starting the service, you should see an output similar to:
```
Loaded users ---- 200
User Kate Wells joined the queue (W:961/L:658/Score:1460.4863221884498/QueueTime:1619941286)
Enqueueing user Kate Wells
User Kristine Newman joined the queue (W:852/L:179/Score:4759.776536312849/QueueTime:1619941286)
...
```
While the service is building the team, you should see similar logs like this:
```
Built team {
  bucketId: '26ab2797-47b6-42a3-9626-d1a0522bfdc7',
  teamSize: 5,
  seedUser: {
    name: 'Kate Wells',
    wins: 961,
    losses: 658,
    score: 1460.4863221884498,
    queueTime: 1619941286
  },
  avgScore: 1483.4472797203296,
  status: 'finalized'
}
┌─────────┬───────────────────┬──────┬────────┬────────────────────┬────────────┐
│ (index) │       name        │ wins │ losses │       score        │ queueTime  │
├─────────┼───────────────────┼──────┼────────┼────────────────────┼────────────┤
│    0    │   'Kate Wells'    │ 961  │  658   │ 1460.4863221884498 │ 1619941286 │
│    1    │ 'Estelle Mendoza' │ 991  │  674   │ 1470.3264094955491 │ 1619941286 │
│    2    │  'Jeanette Bass'  │ 909  │  612   │ 1485.2941176470588 │ 1619941286 │
│    3    │ 'Terry Carpenter' │ 901  │  605   │ 1489.2561983471076 │ 1619941286 │
│    4    │   'Jake Baker'    │ 573  │  379   │ 1511.8733509234828 │ 1619941286 │
└─────────┴───────────────────┴──────┴────────┴────────────────────┴────────────┘
...
```

# Configuration
The service can be configured through a configuration file residing in `config/default.json`.
- `listen.http.port` - Configures which port does the express server listens on. Default is `8088`.
- `user.data.file` - Configures where in `logic/data` folder does the mock user data reside.
- `matchmaking` - Contains a list of match-making parameters.
  - `team_build` - Configurations for building team buckets.
    - `interval_ms` - Interval in milliseconds determining the frequency of team bucket building logic execution.
    - `expansion.agressiveness` - Determines the agressiveness of score range inclusion expansion rate.
    - `expansion.min_score_tolerance` - Minimum score tolerance to avoid having too small a score tolerance during range calculations.
  - `match_build` - Configurations for match-making team buckets.
    - `interval_ms` - Interval in milliseconds determining the frequency of match-making logic execution.
    - `expansion.agressiveness` - Determines the agressiveness of score range inclusion expansion rate.
    - `expansion.min_score_tolerance` - Minimum score tolerance to avoid having too amsll a score tolerance during range calculations.


# Concepts
- This service attempts to match-make individual users/players into matches of 5v5, 3v3, or 1v1.
- The match-making logic will always put priority on creating matches in the sequence of 5v5, 3v3, then 1v1.
- There are 3 kinds of entities that this system involves:
  - Users/Players
  - Teams
  - Matches
- The system goes through 3 steps to build a match:
  - Queue individual Users
  - Build Team buckets & queue Team bucket
  - Build Match Buckets from Team bucket queue
- Note that the steps can be performed in **parallel**.
- Pipeline of match-making
  1) A user joins the queue.
    > In the case of this demo, the users are inserted into the queue automatically at startup. The startup code can be found in `boot.js`).
  2) Team building pipeline tries to go through the user queue and match-make users into teams and put them into **Team Buckets**.
  3) While teams are forming, the Match building pipeline tries to go through the team bucket queue and match-make team buckets into matches.
  4) Regardless of user/team matching, both adopts the concept of **greedy matching**, which match-makes entities as long as they meet the criterias (discussed in scoring later) and they are the oldest in their respective queues.
## User Scoring
- Each user added into the queue is given a **score**.
- The score is calculated similar to that of a 'KD ratio'.
  > In the case of a user, the KD ratio will be equivalent to the wins losses ratio.
- The score is in the form of `(win / losses) * 1000`.
- Calculation of the score can be found in the queueing logic under `logic/data/user_queue`. Calculation is done when a user is being enqueued into the queue (this means that all users in the queue has a score).
- Based on the user score, they are compared with each other to find the *closes* ratio users.
- These users are grouped together into **Team Buckets**.
### User Score Comparison
- When starting to form a team, there will always be a **seed user**.
- Using the score of the seed user, we will search through the queue for using a *score range* anchored on the seed user score.
- The range can be described as follows:
```
{seedScore - tolerance} -> {seedScore + tolerance}
```
- There will always be an *initial* tolerance when starting with the seed user, which is calculated as follows:
```
initial tolerance = agressiveness / seed user score
```
- The `agressiveness` can be tuned in the configuration file.
- If no finalized team is built, the logic goes through several iteration, while expanding the tolerance range on every iteration.
- From the above formulas, the tolerance is doubled for every iteration to loosen the criteria for matching.
- The search **terminates** when the score tolerance reaches a maximum tolerance determined when creating the team initially with the seed player. This is so that it does not search eternally nor expand the range too much and result in an imbalance match.
- The maximum tolerance is set to the seed user's score.
## Team Scoring
- When a team is formed (i.e. finalized with expected number of players), a **team score** will be calculated.
- This is simply the average of score of all the team members (players) within the team.
- This means that each team will have their individual scores.
## Team Score Comparison
- The comparison of the team score determines whether they can be match-made (of course after the consideration of team size).
- Similar to that of a seed user, when we matchmake teams, we will also have the **seed team**
- The score comparison logic is very much similar to users score comparison described above between the seed team and other teams (by comparing score with other team scores through iteration).
- At every iteration, the range is expanded to loosen the criteria.
- The search terminates when the score tolerance reaches the seed team's score itself (i.e. tolerance === seed team score).
- This is so that it does not search eternally nor expand the range too much and result in an imbalance match.

# Source
  - `bin/www` - Main entry point of service.
  - `boot.js` - Contains the boot-up logic (e.g. loading users into the queue).
  - `routes` folder - Contains all the APIs that the service accepts
  - `logic` - Contains all the logic code.
  - `logic/data` - Contains all the code for models.
  - `logic/data/users/sample-data.json` - Contains the mock user data file.

# How to test
Included in the repository is a Postman package in the file `tests/matchmaking.postman_collection.json` that you can use with Postman to retrieve the status of the service:
- Users loaded into the service - `GET <svcurl>/users`
- Users in the queue - `GET <svcurl>/matchmaking/users/queue`
- Team Buckets that were built - `GET <svcurl>/matchmaking/teams`
- Team Buckets in the queue - `GET <svcurl>/matchmaking/teams/queue`
- Matches that were built- `GET <svcurl>/matchmaking/matches`
## Using the Postman package
- Import the package file into Postman
- Configure your default environment in Postman to contain
  - `svcurl` - `http://localhost:8088`
- You can now fire API calls to the service!
## Manually trigger Team/Match building
- Go to `boot.js` in the root of the project.
- Comment out the following lines to stop the auto-processing of users, teams and matches:
```
  setInterval(() => {
    matchMakingLogic.buildTeam();
  }, ...);
  setInterval(() => {
    matchMakingLogic.findNextMatch();
  }, ...);
```
- Using the same Postman package, there are 2 more `POST` APIs:
  - `POST <svcurl>/matchmaking/teams` - Triggers a team bucket building execution.
  - `POST <svcurl>/matchmaking/matches` - Triggers a match-making execution between team buckets in the queue.

# Further improvements
- Split the users logic into it's own microservice. It is under the same service code-base for ease of demo.
- An API for adding users into the user queue.
- A frontend (server-side web page) to display the teams and matches.
- Use a central repository (e.g. Redis) for queue/pool storage to support multi-node execution.
