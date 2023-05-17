const github = require("@actions/github");
const core = require('@actions/core');

async function run() {
  try {
    const token = core.getInput("github-token");
    const octokit = new github.getOctokit(token);
    const payload = github.context.payload;
    const repo = payload.repository.name;
    const owner = payload.repository.owner.login;
    const pullRequestNumber = payload.number;

    if (pullRequestNumber === undefined) {
      core.warning("No pull request number in payload.");
      return;
    }

    const labels = new Set();

    const { data: pullRequest } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullRequestNumber,
    });

    if (pullRequest["author_association"].includes("CONTRIBUTOR")) {
      labels.add("contributor");
    }

    if (pullRequest.draft) {
      labels.add("work in progress");
    } else {
      const { data: reviews } = await octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: pullRequestNumber,
      });

      for (const review of reviews) {
        if (review["author_association"] == "MEMBER" || review["author_association"] == "OWNER") {
          switch (review.state) {
            case "APPROVED":
              labels.add("approved");
              break;
            case "CHANGES_REQUESTED":
              labels.add("changes required");
          }
        }
      }

      if (labels.has("changes required")) {
        labels.delete("approved");
      } else if (!labels.size) {
        labels.add("🕵️‍♀️ needs review");
      }
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
