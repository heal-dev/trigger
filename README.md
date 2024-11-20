# Trigger

This GitHub Action triggers a test suite execution on Heal.dev directly from your continuous integration (CI) workflow. With this action, you can seamlessly integrate Heal's testing capabilities into your development process, ensuring that your applications are thoroughly tested and results are available right in your pull requests.

## Usage

To use the **Heal Trigger Action** in your GitHub workflow, you can trigger a **test suite** using either **suite-id** or a combination of **project-slug** and **suite-slug**. Here’s how to configure it in your GitHub workflow YAML file:

1. Using suite-id
   If you know the unique ID of the test suite, you can use the suite-id directly:

```yaml
- name: Trigger Heal Suite Execution
  uses: heal-dev/trigger@main
  with:
    api-token: ${{ secrets.HEAL_API_TOKEN }} # Required: Your Heal API token.
    suite-id: "443" # Required: The ID of the test suite.
    payload: # Optional: JSON payload for the action.
      { "stories": [{ "id": 5053, "entryHref": "${{ url }}" }] }
    wait-for-results: "yes" # Optional: Wait for results (default: 'yes').
    domain: "https://api.heal.dev" # Optional
    comment-on-pr: "yes" # Optional: Whether to comment test results on PRs (default: 'no').
```

2. Using project-slug and suite-slug
   If you prefer a more descriptive method, use the project-slug and suite-slug, which are unique, URL-friendly identifiers for the project and suite:

```yaml
- name: Trigger Heal Suite Execution
  uses: heal-dev/trigger@main
  with:
    api-token: ${{ secrets.HEAL_API_TOKEN }} # Required: Your Heal API token.
    project-slug: "my-cool-project" # Required: The slug of your project.
    suite-slug: "end-to-end-tests" # Required: The slug of your suite within the project.
    payload: # Optional: JSON payload for the action.
      { "stories": [{ "id": 5053, "entryHref": "${{ url }}" }] }
    wait-for-results: "yes" # Optional: Wait for results (default: 'yes').
    domain: "https://api.heal.dev" # Optional
    comment-on-pr: "yes" # Optional: Whether to comment test results on PRs (default: 'no').
```

## Inputs

| Input              | Required | Description                                                                             |
| ------------------ | -------- | --------------------------------------------------------------------------------------- |
| `api-token`        | ✅       | Your Heal API token (you can create one [here](https://app.heal.dev/organisation/keys)) |
| `suite-id`         | ✅       | (Alternative 1) The unique ID of the test suite.                                        |
| `project-slug`     | ✅       | (Alternative 2) The slug of the project containing the suite.                           |
| `suite-slug`       | ✅       | (Alternative 2) The slug of the suite to be triggered within the project.               |
| `payload`          | ❌       | Optional. If empty, all stories under the suite will be run.                            |
| `wait-for-results` | ❌       | Whether to wait for results (default: `yes`).                                           |
| `domain`           | ❌       | (default: `https://api.heal.dev`).                                                      |
| `comment-on-pr`    | ❌       | Whether to comment test results on PR (default: `no`).                                  |

## How to Choose Between suite-id and Slugs?

**suite-id**: Use this if you already have the numeric ID of the test suite from Heal.dev.

**project-slug and suite-slug**: A slug is a unique, URL-friendly identifier for a project or suite. Slugs are typically lowercase strings without spaces, often used in place of the full project or suite name.

For example:
Project name: "My Cool Project" → my-cool-project
Suite name: "End-to-End Tests" → end-to-end-tests

**Note**: If you use both suite-id and project-slug/suite-slug, the action will throw an error, as only one method is allowed.

## Example

Here is a complete example of a GitHub Actions workflow that triggers the Heal test suite execution:

```yaml
name: Heal Test Workflow

on:
  pull_request: # Trigger the workflow on pull requests.
    branches:
      - main # Adjust to your branch names.

jobs:
  heal-test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v2

      - name: Trigger Heal Suite Execution
        uses: heal-dev/trigger@main
        with:
          api-token: ${{ secrets.HEAL_API_TOKEN }} # Required: Your Heal API token.
          project-slug: "my-cool-project" # Required: The slug of your project.
          suite-slug: "end-to-end-tests" # Required: The slug of your suite.
          payload: # Optional: JSON payload for the action.
            { "stories": [{ "id": 5053, "entryHref": "${{ url }}" }] }
          wait-for-results: "yes" # Optional: Wait for results (default: 'yes').
          domain: "https://api.heal.dev" # Optional
          comment-on-pr: "yes" # Optional: Whether to comment test results on PRs (default: 'no').
```
