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

    debug(`Pull request data: ${pullRequest}`)
    debug(`Pull request author association: ${pullRequest["author_association"]}`)

    // if (pullRequest["author_association"].includes("CONTRIBUTOR")) {
    //   labels.add("contributor");
    // }

    if (pullRequest.draft) {
      labels.add("work in progress");
    } else {
      const { data: reviews } = await octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: pullRequestNumber,
      });

      for (const review of reviews) {
        debug(`Review data: ${review}`)
        debug(`Review author association: ${review.user.login} ${review["author_association"]}`)

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
      } else if (!labels.has("approved")) {
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

function debug(msg) {
  core.info(msg);
}
