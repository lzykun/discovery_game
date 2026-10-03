## Main task description

A transmission chain study consisting of:
- 20 chains (configurable) x 3 conditions (easy, medium, hard; configurable) = 60 chains

Each chain consists of:
- 3 generations (configurable)

And each generation per chain recruits:
- 20 participants (configurable)

The initial generation completes the task in `task-base.html` (using `task-base.js` and other helper functions)

Data is saved, and then processed following the logic in `prepare_messages.py`

Generation x+1 reads the messages from generation x, as defined in `task-after.html` (using `task-after.js` and other helper functions)

## Nice to have

- Unify the instruction phase experience using the one from `task-after.html` 
- Remove special characters in message data to make later analysis easier
- Save data robustly
- Recruit participants smartly: each chain and each condition can go in parallel; a new generation for a given condition should only start recuiting when the previous generation in that condition has completed. 
