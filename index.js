const core = require('@actions/core');
const { context, getOctokit } = require('@actions/github');


async function createTestSummary(results, url) {
    const { runs, projectName, suiteName } = results;

    // Calculate statistics
    const totalTests = runs.length;
    const passedTests = runs.filter(run => run.result === 'PASS');
    const failedTests = runs.filter(run => run.result === 'FAIL');
    const pendingTests = runs.filter(run => run.result === 'CRASH');

    // Create table header and row
    const tableHeader = [
        { data: 'Total Tests', header: true },
        { data: 'Passed', header: true },
        { data: 'Failed', header: true },
        { data: 'Agent Needs More Input', header: true }
    ];

    const tableRow = [
        `${totalTests}`,
        `${passedTests.length}`,
        `${failedTests.length}`,
        `${pendingTests.length}`
    ];

    core.summary
        .addHeading('🧪 Heal Test Results', 2)
        .addHeading(`Project: ${projectName}`, 3)
        .addHeading(`Suite: ${suiteName}`, 3)
        .addTable([tableHeader, tableRow]);


    if (failedTests.length > 0) {
        core.summary.addHeading('Failed Tests', 4);
        failedTests.forEach(run => {
            core.summary.addRaw(`❌ Run ${run.id} `).addLink('View Result', run.link).addEOL();
        });
    }
    if (pendingTests.length > 0) {
        core.summary.addHeading('Tests Needing More Input', 4);
        pendingTests.forEach(run => {
            core.summary.addRaw(`⚠️ Run ${run.id} `).addLink('View Result', run.link).addEOL();
        });
    }
    core.summary.addRaw('----------------------------').addEOL();
    core.summary.addLink('View All Details', url).addEOL();
    await core.summary.write();
    return '';
}

async function createPRComment(githubToken, body) {
    if (!githubToken || !context.payload.pull_request) {
        if (!githubToken) {
            core.info('No github token provided');
        }
        return;
    }
    const octokit = getOctokit(githubToken);
    await octokit.rest.issues.createComment({
        ...context.repo,
        issue_number: context.payload.pull_request.number,
        body: body
    });
}

function formatTestResults(results, url) {
    const { runs, projectName, suiteName } = results;
    let comment = '## 🧪 Heal Test Results\n\n';

    comment += `**Project**: ${projectName}\n`;
    comment += `**Suite**: ${suiteName}\n\n`;

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
            if (run.result === 'FAIL') {
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

function validatePayloadFormat(payload) {
    if (!Array.isArray(payload.stories)) {
        throw new Error('Invalid payload: "stories" must be an array.');
    }

    payload.stories.forEach(story => {
        if (typeof story.id !== 'number') {
            throw new Error(`Invalid story: "id" must be a number. Found ${typeof story.id}.`);
        }
        if (story.entryHref && typeof story.entryHref !== 'string') {
            throw new Error(`Invalid story: "entryHref" must be a string if provided. Found ${typeof story.entryHref}.`);
        }
        if (story.variables && typeof story.variables !== 'object') {
            throw new Error(`Invalid story: "variables" must be an object if provided. Found ${typeof story.variables}.`);
        }
    });
}

function validateStoriesFormat(config) {
    if (config['test-config']) {
        const testConfig = config['test-config'];
        if (testConfig.entrypoint && typeof testConfig.entrypoint !== 'string') {
            throw new Error(`Invalid test-config: "entrypoint" must be a string if provided. Found ${typeof testConfig.entrypoint}.`);
        }
        if (testConfig.variables && typeof testConfig.variables !== 'object') {
            throw new Error(`Invalid test-config: "variables" must be an object if provided. Found ${typeof testConfig.variables}.`);
        }
    }

    if (config.stories && !Array.isArray(config.stories)) {
        throw new Error('Invalid stories: "stories" must be an array.');
    }

    if (config.stories) {
        config.stories.forEach(story => {
            if (typeof story.slug !== 'string') {
                throw new Error(`Invalid story: "slug" must be a string. Found ${typeof story.slug}.`);
            }
            if (story['test-config']) {
                const testConfig = story['test-config'];
                if (testConfig.entrypoint && typeof testConfig.entrypoint !== 'string') {
                    throw new Error(`Invalid test-config: "entrypoint" must be a string if provided. Found ${typeof testConfig.entrypoint}.`);
                }
                if (testConfig.variables && typeof testConfig.variables !== 'object') {
                    throw new Error(`Invalid test-config: "variables" must be an object if provided. Found ${typeof testConfig.variables}.`);
                }
            }

        });
    }
}

function validateInput(inputType, input) {
    switch (inputType) {
        case 'payload':
            validatePayloadFormat(input);
            break;
        case 'stories':
            validateStoriesFormat(input);
            break;
        default:
            throw new Error('Invalid input type for validation.');
    }
}


async function run() {
    try {
        // Get inputs
        const suiteId = core.getInput('suite-id');
        const suite = core.getInput('suite');
        const payload = core.getInput('payload');
        const stories = core.getInput('stories');
        const testConfig = core.getInput('test-config');

        if (suiteId && suite) {
            core.setFailed('Please provide either suite-id or suite, not both.');
            return;
        }
        if (!suiteId && !suite) {
            core.setFailed('Please provide either suite-id or suite.');
            return;
        }

        if (suiteId && (stories || testConfig)) {
            core.setFailed('When "suite-id" is provided, "stories" should come from "payload", not "stories" or "test-config".');
            return;
        }

        if (suite && payload) {
            core.setFailed('When "suite" is provided, "stories" should come from "stories", not "payload".');
            return;
        }

        const apiToken = core.getInput('api-token');
        const waitForResults = core.getInput('wait-for-results') || 'yes';
        const domain = core.getInput('domain') || 'https://api.heal.dev';
        const commentOnPr = core.getInput('comment-on-pr') || 'no';
        const githubToken = core.getInput('github-token');

        /**
        * @type {{ stories: { id: number, entryHref: string, variables?: Record<string, string> }[]} ||
        * { stories: { slug: string, "test-config"?: { entrypoint?: string, variables?: Record<string, string> } }[],
        *  "test-config"?: { entrypoint?: string, variables?: Record<string, string> } }}
        */
        let validatedPayload;
        try {

            const inputPayload = core.getInput('payload');
            const inputStories = core.getInput('stories');

            if (suiteId && inputPayload) {
                validatedPayload = JSON.parse(inputPayload);
                validateInput('payload', validatedPayload);
            } else if (suite) {
                validatedPayload = {};
                if (inputStories) {
                    validatedPayload.stories = JSON.parse(inputStories);
                }
                if (testConfig) {
                    validatedPayload["test-config"] = JSON.parse(testConfig);
                }
                if (validatedPayload) {
                    validateInput('stories', validatedPayload, testConfig);
                }
            } else {
                validatedPayload = suiteId ? {} : { stories: [] };
            }

        } catch (error) {
            core.setFailed(`Invalid JSON payload: ${error.message}`);
            return;
        }

        // Construct trigger URL
        let triggerUrl, projectSlug, suiteSlug;
        if (suiteId) {
            triggerUrl = `${domain}/api/suite/${suiteId}/trigger`;
        } else {
            [projectSlug, suiteSlug] = suite.split('/');
            if (!projectSlug || !suiteSlug) {
                core.setFailed('Invalid suite input. Please provide the suite in the format "project/suite".');
                return;
            }
            triggerUrl = `${domain}/api/projects/${projectSlug}/suites/${suiteSlug}/trigger`;
        }

        core.info(`Triggering suite execution at ${triggerUrl}...`);

        // Trigger the suite execution
        core.debug(`POST ${triggerUrl} with payload: ${JSON.stringify(validatedPayload)}`);
        const triggerResponse = await fetch(triggerUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(validatedPayload)
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
                    try {
                        await createTestSummary(report, report.link);
                        core.info('Posted test summary to summary section.');
                    } catch (error) {
                        core.warning(`Failed to post test summary: ${error.message}`);
                    }

                    // Post comment to PR if requested
                    if (commentOnPr === 'yes' || commentOnPr === 'true') {
                        try {
                            const comment = formatTestResults(report, report.link);
                            await createPRComment(githubToken, comment);
                            core.info('Posted test results to PR comment.');
                        } catch (error) {
                            core.warning(`Failed to post PR comment: ${error.message}`);
                        }
                    }

                    if (allPassed) {
                        core.info('All runs passed.');
                    } else {
                        core.setFailed(`One or more runs failed. Check details here: ${report.link}`);
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
module.exports = { run, createTestSummary, createPRComment, formatTestResults };
