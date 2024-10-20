const core = require('@actions/core');
const axios = require('axios');

async function run() {
    try {
        // Get inputs
        const apiToken = core.getInput('api-token');
        const suiteId = core.getInput('suite-id');
        const payloadInput = core.getInput('payload');
        const waitForResults = core.getInput('wait-for-results') || 'yes';
        const domain = core.getInput('domain') || 'https://api.heal.dev';

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
        const triggerResponse = await axios.post(triggerUrl, payload, {
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            }
        });

        const { executionId, url } = triggerResponse.data;

        core.info(`Execution started with ID ${executionId}.`);
        core.setOutput('execution-id', executionId);
        core.setOutput('execution-url', url);
        core.info(`execution-url:${url}`);

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
                const executionResponse = await axios.get(executionUrl, {
                    headers: {
                        'Authorization': `Bearer ${apiToken}`
                    }
                });

                const report = executionResponse.data;
                status = report.status;

                core.info(`Execution status: ${status}`);

                if (status === 'finished') {
                    core.info('Execution finished.');
                    // Process the report
                    const runs = report.runs;
                    let allPassed = true;
                    for (const run of runs) {
                        core.info(`Run ${run.id} - status: ${run.status}, result: ${run.result}`);
                        core.info(`URL: ${run.url}`);
                        if (run.result !== 'PASS') {
                            allPassed = false;
                        }
                    }

                    if (allPassed) {
                        core.info('All runs passed.');
                    } else {
                        core.setFailed('One or more runs failed.');
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
