# Trigger

This GitHub Action triggers a test suite execution on Heal.dev directly from your continuous integration (CI) workflow. With this action, you can seamlessly integrate Heal's testing capabilities into your development process, ensuring that your applications are thoroughly tested and results are available right in your pull requests.

## Usage

To use the **Heal Trigger Action** in your GitHub workflow, you can configure the action using either a **suite ID** or a **suite slug name**.

### Using Suite Slug Name (recommended)

This method uses the project slug name and suite slug name. A slug is a unique, URL-friendly identifier, typically lowercase, without spaces.

**Project slug name**: Derived from your project name (e.g., "My Cool Project" → my-cool-project).

**Suite slug name**: Derived from your suite name (e.g., "End-to-End Tests" → end-to-end-tests).

Example Slug Name:

project-slug-name/suite-slug-name (e.g., my-cool-project/end-to-end-tests).

```yaml
- name: Trigger Heal Suite Execution
  uses: heal-dev/trigger@main
  with:
    api-token: ${{ secrets.HEAL_API_TOKEN }} # Required: Your Heal API token.
    suite: "project-test/suite-test" # Required: The ID of the test suite.
    stories: | # Optional: JSON payload for the action.
      [
        {
          "slug": "create-a-block-then-cleanup",  # Slug of the story to run.
          "test-config":                          # Custom test configuration for this story.
            {
              "entrypoint": "https://app-staging.heal.dev",  # URL to override the default entry point.
              "variables":                                   #  Variables to customize the test configuration.
                {
                  "buttonName": "Test"
                }
              }
        }
      ]
    wait-for-results: "yes" # Optional: Wait for results (default: 'yes').
    domain: "https://api.heal.dev" # Optional
    comment-on-pr: "yes" # Optional: Whether to comment test results on PRs (default: 'no').
```

## Inputs

| Input              | Required | Description                                                                             |
| ------------------ | -------- | --------------------------------------------------------------------------------------- |
| `api-token`        | ✅       | Your Heal API token (you can create one [here](https://app.heal.dev/organisation/keys)) |
| `suite`            | ✅       | The slug name of the test suite (e.g., project-slug-name/suite-slug-name).              |
| `stories`          | ❌       | Optional JSON payload to specify story slugs and override test configurations           |
| `wait-for-results` | ❌       | Whether to wait for results (default: `yes`).                                           |
| `domain`           | ❌       | (default: `https://api.heal.dev`).                                                      |
| `comment-on-pr`    | ❌       | Whether to comment test results on PR (default: `no`).                                  |

### Using Suite ID (legacy)

Use this method if you already have the numeric ID of the test suite and optionally the ID of the specific story you want to run from Heal.dev.

```yaml
- name: Trigger Heal Suite Execution
  uses: heal-dev/trigger@main
  with:
    api-token: ${{ secrets.HEAL_API_TOKEN }} # Required: Your Heal API token.
    suite-id: "443" # Required: The ID of the test suite.
    payload: | # Optional: JSON payload for the action.
      {
        "stories": [  
          {
            "id": 5053, # ID of the story to run.
            "entryHref": "www.google.com"  # URL to test, overrides the default setting.
            "variables":                   # Variables to customize the test configuration.
              {
                "buttonName": "send"    
              }
          }
        ]
      }
    wait-for-results: "yes" # Optional: Wait for results (default: 'yes').
    domain: "https://api.heal.dev" # Optional
    comment-on-pr: "yes" # Optional: Whether to comment test results on PRs (default: 'no').
```

## Inputs

| Input              | Required | Description                                                                             |
| ------------------ | -------- | --------------------------------------------------------------------------------------- |
| `api-token`        | ✅       | Your Heal API token (you can create one [here](https://app.heal.dev/organisation/keys)) |
| `suite-id`         | ✅       | The ID of the test suite.                                                               |
| `payload`          | ❌       | Optional JSON payload. Use this to specify stories, override the entryHref (URL),       |
|                    |          | or provide variables to customize the test configuration.                               |
| `wait-for-results` | ❌       | Whether to wait for results (default: `yes`).                                           |
| `domain`           | ❌       | (default: `https://api.heal.dev`).                                                      |
| `comment-on-pr`    | ❌       | Whether to comment test results on PR (default: `no`).                                  |
