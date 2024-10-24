import core from '@actions/core';
import sinon from 'sinon';
import {run, createPRComment, formatTestResults}from'./index.js';
import test from 'node:test';
import assert from 'node:assert';
import github from '@actions/github';

// Move stub declarations outside to ensure proper cleanup
let coreGetInputStub;
let coreSetOutputStub;
let coreSetFailedStub;
let fetchStub;

function setupMocks() {
    cleanupMocks();
    
    coreGetInputStub = sinon.stub(core, 'getInput');
    coreSetOutputStub = sinon.stub(core, 'setOutput');
    coreSetFailedStub = sinon.stub(core, 'setFailed');
    fetchStub = sinon.stub(global, 'fetch');
}

function cleanupMocks() {
    coreGetInputStub?.restore();
    coreSetOutputStub?.restore();
    coreSetFailedStub?.restore();
    fetchStub?.restore();
}

test('GitHub Action - Trigger Suite Execution', async (t) => {
    try {
        setupMocks();
        
        coreGetInputStub.callsFake((name) => {
            const inputs = {
                'api-token': 'mocked-token',
                'suite-id': '12345',
                'payload': JSON.stringify({ key: 'value' }),
                'wait-for-results': 'yes',
                'domain': 'https://api.heal.dev'
            };
            return inputs[name] || '';
        });

        fetchStub.onFirstCall().resolves({
            ok: true,
            json: async () => ({
                executionId: 'mock-execution-id',
                url: 'https://example.com/execution/mock-execution-id'
            })
        });

        fetchStub.onSecondCall().resolves({
            ok: true,
            json: async () => ({
                status: 'finished',
                runs: [{
                    id: 'run1',
                    status: 'finished',
                    result: 'PASS',
                    url: 'https://example.com/run1'
                }]
            })
        });

        await run();

        assert.ok(coreSetOutputStub.calledWith('execution-id', 'mock-execution-id'));
        assert.ok(coreSetOutputStub.calledWith('execution-url', 'https://example.com/execution/mock-execution-id'));
        
        assert.ok(fetchStub.firstCall.args[0] === 'https://api.heal.dev/api/suite/12345/trigger');
        assert.deepStrictEqual(fetchStub.firstCall.args[1], {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer mocked-token',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ key: 'value' })
        });
    } finally {
        cleanupMocks();
    }
});

test('should handle invalid JSON payload', async (t) => {
    try {
        setupMocks();
        
        coreGetInputStub.callsFake((name) => {
            const inputs = {
                'api-token': 'mocked-token',
                'suite-id': '12345',
                'payload': 'invalid-json',
                'wait-for-results': 'yes',
                'domain': 'https://api.heal.dev'
            };
            return inputs[name] || '';
        });

        await run();

        assert.ok(coreSetFailedStub.calledWithMatch('Invalid JSON payload'));
    } finally {
        cleanupMocks();
    }
});

test('should handle execution timeout', async (t) => {
    try {
        setupMocks();
        
        coreGetInputStub.callsFake((name) => {
            const inputs = {
                'api-token': 'mocked-token',
                'suite-id': '12345',
                'payload': JSON.stringify({ key: 'value' }),
                'wait-for-results': 'yes',
                'domain': 'https://api.heal.dev'
            };
            return inputs[name] || '';
        });

        fetchStub.onFirstCall().resolves({
            ok: true,
            json: async () => ({
                executionId: 'mock-execution-id',
                url: 'https://example.com/execution/mock-execution-id'
            })
        });

        fetchStub.resolves({
            ok: true,
            json: async () => ({
                status: 'running'
            })
        });

        const startTime = Date.now();
        const fakeNow = sinon.stub(Date, 'now');
        
        try {
            fakeNow.onCall(0).returns(startTime);
            fakeNow.onCall(1).returns(startTime + 16 * 60 * 1000); // 16 minutes later

            await run();

            assert.ok(coreSetFailedStub.calledWithMatch("Execution timed out"));
        } finally {
            fakeNow.restore();
        }
    } finally {
        cleanupMocks();
    }
});

test('should handle API errors', async (t) => {
    try {
        setupMocks();
        
        coreGetInputStub.callsFake((name) => {
            const inputs = {
                'api-token': 'mocked-token',
                'suite-id': '12345',
                'payload': JSON.stringify({ key: 'value' }),
                'wait-for-results': 'yes',
                'domain': 'https://api.heal.dev'
            };
            return inputs[name] || '';
        });

        // Mock failed API request
        fetchStub.resolves({
            ok: false,
            status: 500
        });

        await run();

        assert.ok(coreSetFailedStub.calledWithMatch("HTTP error! status: 500"));
    } finally {
        cleanupMocks();
    }
});

test('should handle network errors', async (t) => {
    try {
        setupMocks();
        
        coreGetInputStub.callsFake((name) => {
            const inputs = {
                'api-token': 'mocked-token',
                'suite-id': '12345',
                'payload': JSON.stringify({ key: 'value' }),
                'wait-for-results': 'yes',
                'domain': 'https://api.heal.dev'
            };
            return inputs[name] || '';
        });

        // Mock network error
        fetchStub.rejects(new Error('Network error'));

        await run();

        assert.ok(coreSetFailedStub.calledWithMatch("Network error"));
    } finally {
        cleanupMocks();
    }
});

test('formatTestResults should format results correctly', (t) => {
    try {
    setupMocks();
    const results = {
        runs: [
            { id: 'run1', status: 'finished', result: 'PASS', url: 'https://example.com/run1' },
            { id: 'run2', status: 'finished', result: 'FAIL', url: 'https://example.com/run2' }
        ]
    };

    const expectedComment = 
        '## 🧪 Heal Test Results\n\n' +
        '### Summary\n' +
        '- Total Tests: 2\n' +
        '- Passed: 1\n' +
        '- Failed: 1\n\n' +
        '### Detailed Results\n\n' +
        '| Test | Status | Result | Link |\n' +
        '|------|--------|--------|------|\n' +
        '| run1 | finished | ✅ PASS | [View Details](https://example.com/run1) |\n' +
        '| run2 | finished | ❌ FAIL | [View Details](https://example.com/run2) |\n';

    const actualComment = formatTestResults(results);
    assert.strictEqual(actualComment, expectedComment);
    } finally {
    cleanupMocks();
    }
});

// test('createPRComment should create a comment on PR', async (t) => {

//     const token = 'mocked-token';
//     const body = 'This is a test comment';
//     const githubContextStub = sinon.stub(github, 'context').get(() => ({
//         payload: {
//             pull_request: { number: 123 } // Simulate pull request context
//         },
//         repo: {
//             owner: 'owner-name',
//             repo: 'repo-name',
//         },
//     }));

//     const githubGetOctokitStub = sinon.stub(github, 'getOctokit');

//     const octokitMock = {
//         rest: {
//             issues: {
//                 createComment: sinon.stub().resolves()
//             }
//         }
//     };

//     githubGetOctokitStub.returns(octokitMock);

//     await createPRComment(token, body);

//     assert.ok(octokitMock.rest.issues.createComment.calledOnce);

//     assert.deepStrictEqual(octokitMock.rest.issues.createComment.firstCall.args[0], {
//         owner: 'owner-name',
//         repo: 'repo-name',
//         issue_number: 123, 
//         body: body
//     });
//     githubContextStub.restore(); 
//     githubGetOctokitStub.restore(); 
// });
