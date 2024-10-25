import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';

const githubToken = process.env.GITHUB_TOKEN;

export async function createPRComment(body) {
    if (!githubToken || !context.payload.pull_request) {
        return;
    }

    const octokit = getOctokit(githubToken);
    await octokit.rest.issues.createComment({
        ...context.repo,
        issue_number: context.payload.pull_request.number,
        body: body
    });
}

export function formatTestResults(results, url) {
    const { runs } = results;
    let comment = '## 🧪 Heal Test Results\n\n';

    const totalTests = runs.length;
    const passedTests = runs.filter(run => run.result === 'PASS').length;
    const failedTests = runs.filter(run => run.result === 'FAIL').length;
    const agentNeedsInput = totalTests - passedTests - failedTests;

    comment += `### Summary\n`;
    comment += `- **Total Tests**: ${totalTests}\n`;
    comment += `- **Passed**: ✅ ${passedTests}\n`;
    comment += `- **Failed**: 🔴 ${failedTests}\n`;
    comment += `- **Agent Needs More Input**: 🟡 ${agentNeedsInput}\n\n`;

    if (failedTests > 0) {
        comment += `### Failed Tests\n`;
        for (const run of runs) {
            if (run.result !== 'PASS') {
                comment += `- **Run ${run.id}**: [View Details](${run.link})\n`;
            }
        }
        comment += `\n`;
    }

    if (agentNeedsInput > 0) {
        comment += `### Agent Needs More Input Tests\n`;
        for (const run of runs) {
            if (run.result === 'CRASH') {
                comment += `- **Run ${run.id}**: [View Details](${run.link})\n`;
            }
        }
        comment += `\n`;
    }

    comment += `[View All Details](${url})\n`;

    return comment;
}

export async function run() {
    try {
        // Get inputs
        const apiToken = core.getInput('api-token');
        const suiteId = core.getInput('suite-id');
        const payloadInput = core.getInput('payload');
        const waitForResults = core.getInput('wait-for-results') || 'yes';
        const domain = core.getInput('domain') || 'https://api.heal.dev';
        const commentOnPr = core.getInput('comment-on-pr') || 'yes';

        // Parse and validate payload
        let payload;
        try {
            payload = payloadInput ? JSON.parse(payloadInput) : {};
        } catch (error) {
            core.setFailed(`Invalid JSON payload: ${error.message}`);
            return;
        }

        // Construct trigger URL
        const triggerUrl = `${domain}/api/suite/${suiteId}/trigger`;

        core.info(`Triggering suite execution at ${triggerUrl}...`);

        // Trigger the suite execution
        core.debug(`POST ${triggerUrl} with payload: ${JSON.stringify(payload)}`);
        const triggerResponse = await fetch(triggerUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!triggerResponse.ok) {
            throw new Error(`HTTP error! status: ${triggerResponse.status}`);
        }

        const triggerData = await triggerResponse.json();
        const { executionId, url } = triggerData;

        core.info(`Execution started with ID ${executionId}.`);
        core.info(`execution-url: ${url}`);
        core.setOutput('execution-id', executionId);
        core.setOutput('execution-url', url);

        // Decide whether to wait for results
        if (waitForResults.toLowerCase() === 'yes' || waitForResults.toLowerCase() === 'true') {
            core.info(`Waiting for execution ${executionId} to finish...`);

            let status = 'running';
            const executionUrl = `${domain}/api/execution/${executionId}`;
            const maxWaitTime = 15 * 60 * 1000; // 15 minutes
            const startTime = Date.now();

            while (status === 'running') {
                if (Date.now() - startTime > maxWaitTime) {
                    core.setFailed('Execution timed out.');
                    return;
                }

                // Wait for 5 seconds before polling again
                await new Promise(resolve => setTimeout(resolve, 5000));

                // Poll the execution status
                const executionResponse = await fetch(executionUrl, {
                    headers: {
                        'Authorization': `Bearer ${apiToken}`
                    }
                });

                if (!executionResponse.ok) {
                    throw new Error(`HTTP error! status: ${executionResponse.status}`);
                }

                const report = await executionResponse.json();

                status = report.status;
                core.info(`Execution status: ${status}`);

                if (status === 'finished') {
                    core.info('Execution finished.');
                    // Process the report
                    const runs = report.runs;
                    let allPassed = true;
                    for (const run of runs) {
                        const result = (run.result === 'CRASH') ? 'The agent needs more input to complete these stories' : run.result;
                        core.info(`Run ${run.id} - status: ${run.status}, result: ${result}`);
                        core.info(`URL: ${run.link}`);
                        if (run.result !== 'PASS') {
                            allPassed = false;
                        }
                    }

                    // Post comment to PR if requested
                    if (commentOnPr === 'yes' || commentOnPr === 'true') {
                        try {
                            const comment = formatTestResults(report, `${url}?executionId=${executionId}`);
                            await createPRComment(comment);
                            core.info('Posted test results to PR');
                        } catch (error) {
                            core.warning(`Failed to post PR comment: ${error.message}`);
                        }
                    }

                    if (allPassed) {
                        core.info('All runs passed.');
                    } else {
                        core.setFailed(`One or more runs failed. Check details here: ${url}?executionId=${executionId}`);
                    }
                }
            }
        } else {
            core.info('Not waiting for execution to finish.');
        }

    } catch (error) {
        core.setFailed(`Action failed with error: ${error.message}`);
    }
}

run();
