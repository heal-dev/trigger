# Trigger

This GitHub Action triggers a test suite execution on Heal.dev directly from your continuous integration (CI) workflow. With this action, you can seamlessly integrate Heal's testing capabilities into your development process, ensuring that your applications are thoroughly tested and results are available right in your pull requests.

## Usage

To use the **Heal Trigger Action** in your GitHub workflow, include the following configuration in your workflow YAML file:

```yaml
- name: Trigger Heal Suite Execution
  uses: heal-dev/trigger@main
  with:
    api-token: ${{ secrets.HEAL_API_TOKEN }}  # Required: Your Heal API token.
    suite-id: '443'                            # Required: The ID of the test suite.
    payload:                                   # Optional: JSON payload for the action.
      {
        "stories": [
          {
            "id": 5053,
            "entryHref": "${{ needs.deploy-preview.outputs.preview_url }}"  # Required: Your product URL.
          }
        ]
      }
    wait-for-results: 'yes'                     # Optional: Wait for results (default: 'yes').
    domain: 'https://api-staging.heal.dev'     # Optional
    github-token: ${{ secrets.GITHUB_TOKEN }}   # Optional: GitHub token for commenting on PRs.
    comment-on-pr: 'yes'                        # Optional: Whether to comment test results on PRs (default: 'no').
```

## Inputs

| Input              | Required | Description                                           |
|--------------------|----------|-------------------------------------------------------|
| `api-token`        | ✅       | Your Heal API token.                                   |
| `suite-id`         | ✅       | The ID of the test suite.                              |
| `payload`          | ❌       | Optional JSON payload for the action.                  |
| `wait-for-results` | ❌       | Whether to wait for results (default: `yes`).          |
| `domain`           | ❌       | (default: `https://api.heal.dev`).                     |
| `github-token`     | ❌       | GitHub token for PR comments (optional).               |
| `comment-on-pr`    | ❌       | Whether to comment test results on PR (default: `no`). |

## Outputs

| Output          | Description                           |
|-----------------|---------------------------------------|
| `execution-id`  | The ID of the execution started.      |
| `execution-url` | The URL to view the execution.        |

## Example

Here is a complete example of a GitHub Actions workflow that triggers the Heal test suite execution:

```yaml
name: Heal Test Workflow

on: 
  pull_request:                         # Trigger the workflow on pull requests.
    branches:
      - main                           # Adjust to your branch names.

jobs:
  heal-test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v2

      - name: Trigger Heal Suite Execution
        uses: heal-dev/trigger@main
        with:
          api-token: ${{ secrets.HEAL_API_TOKEN }}  # Required: Your Heal API token.
          suite-id: '443'                            # Required: The ID of the test suite.
          payload:                                   # Optional: JSON payload for the action.
            {
              "stories": [
                {
                  "id": 5053,
                  "entryHref": "${{ needs.deploy-preview.outputs.preview_url }}"  # Required: Your product URL.
                }
              ]
            }
          wait-for-results: 'yes'                     # Optional: Wait for results (default: 'yes').
          domain: 'https://api-staging.heal.dev'     # Optional
          github-token: ${{ secrets.GITHUB_TOKEN }}   # Optional: GitHub token for commenting on PRs.
          comment-on-pr: 'yes'                        # Optional: Whether to comment test results on PRs (default: 'no').

```