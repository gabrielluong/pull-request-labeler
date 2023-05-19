const github = require("@actions/github");
const core = require('@actions/core');

async function run() {
  try {
    const token = core.getInput("github-token");
    const octokit = new github.getOctokit(token);
    const payload = github.context.payload;
    const repo = payload.repository.name;
    const owner = payload.repository.owner.login;
    const pullRequestNumber = payload["pull_request"].number;

    if (payload["pull_request"].user.type == "Bot") {
      core.warning("Don't run actions for Bots.");
      return;
    } else if (pullRequestNumber === undefined) {
      core.warning("No pull request number in payload.");
      return;
    }

    const { data: pullRequest } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullRequestNumber,
    });

    const labels = new Set(pullRequest.labels.map(label => label.name));

    labels.delete("work in progress");
    labels.delete("approved");
    labels.delete("changes required");
    labels.delete("🕵️‍♀️ needs review");

    debug(`Pull request data: ${JSON.stringify(pullRequest)}`);

    if (pullRequest.draft) {
      labels.add("work in progress");
    } else {
      const { data: reviews } = await octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: pullRequestNumber,
      });

      // Map of reviewers to their review feedback state.
      const reviewers = new Map();

      for (const review of reviews) {
        debug(`Review data: ${JSON.stringify(review)}`);

        if (["APPROVED", "CHANGES_REQUESTED"].includes(review.state)) {
          // Reviews are listed in chronological order - last reviews are more recent.
          // Get the most recent review status for each reviewer.
          reviewers.set(review.user.login, review.state);
        }
      }

      const reviewState = [...reviewers.values()];

      if (reviewState.includes("CHANGES REQUESTED")) {
        labels.add("changes required");
      } else if (reviewState.includes("APPROVED")) {
        labels.add("approved");
      } else {
        labels.add("🕵️‍♀️ needs review");
      }

      await octokit.rest.issues.addAssignees({
        owner,
        repo,
        issue_number: pullRequestNumber,
        assignees: [...reviewers.keys()],
      });
    }

    await octokit.rest.issues.setLabels({
      owner,
      repo,
      issue_number: pullRequestNumber,
      labels: Array.from(labels),
    });

    const { data: reviewers } = await octokit.rest.pulls.listRequestedReviewers({
      owner,
      repo,
      pull_number: pullRequestNumber,
    });

    await octokit.rest.issues.addAssignees({
      owner,
      repo,
      issue_number: pullRequestNumber,
      assignees: reviewers.users.map(user => user.login),
    });

    core.notice(`Added labels to #${pullRequestNumber}.`);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();

function debug(msg) {
  core.info(msg);
}
