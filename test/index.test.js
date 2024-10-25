import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { createPRComment, formatTestResults, run } from '../src/index.js';


jest.mock('@actions/core');
jest.mock('@actions/github');


describe('GitHub Action Tests', () => {
    // Clear all mocks before each test
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('createPRComment', () => {
        it('should create a PR comment successfully', async () => {

            context.payload = { pull_request: { number: 123 } };
            context.repo = { owner: 'test-owner', repo: 'test-repo' };


            const mockCreateComment = jest.fn();
            getOctokit.mockReturnValue({
                rest: {
                    issues: {
                        createComment: mockCreateComment
                    }
                }
            });

            await createPRComment('fake-token', 'Test comment');

            expect(mockCreateComment).toHaveBeenCalledWith({
                owner: 'test-owner',
                repo: 'test-repo',
                issue_number: 123,
                body: 'Test comment'
            });
        });

        it('should do nothing when token is missing', async () => {
            const mockCreateComment = jest.fn();
            getOctokit.mockReturnValue({
                rest: {
                    issues: {
                        createComment: mockCreateComment
                    }
                }
            });

            await createPRComment(null, 'Test comment');

            expect(mockCreateComment).not.toHaveBeenCalled();
        });

        it('should do nothing when pull_request is missing', async () => {
            context.payload = {};
            const mockCreateComment = jest.fn();
            getOctokit.mockReturnValue({
                rest: {
                    issues: {
                        createComment: mockCreateComment
                    }
                }
            });

            await createPRComment('fake-token', 'Test comment');

            expect(mockCreateComment).not.toHaveBeenCalled();
        });
    });

    describe('formatTestResults', () => {
        it('should format test results correctly', () => {
            const mockResults = {
                runs: [
                    { result: 'PASS' },
                    { result: 'FAIL' },
                    { result: 'PASS' },
                    { result: 'CRASH' }
                ]
            };
            const url = 'https://example.com/test';

            const formatted = formatTestResults(mockResults, url);

            expect(formatted).toContain('Total Tests: 4');
            expect(formatted).toContain('Passed: ✅ 2');
            expect(formatted).toContain('Failed: 🔴 1');
            expect(formatted).toContain('Agent Needs Input: 🟡 1');
            expect(formatted).toContain(url);
        });

        it('should handle empty runs array', () => {
            const mockResults = { runs: [] };
            const url = 'https://example.com/test';

            const formatted = formatTestResults(mockResults, url);

            expect(formatted).toContain('Total Tests: 0');
            expect(formatted).toContain('Passed: ✅ 0');
            expect(formatted).toContain('Failed: 🔴 0');
            expect(formatted).toContain('Agent Needs Input: 🟡 0');
        });
    });

    describe('run', () => {
        const mockInputs = {
            'api-token': 'fake-token',
            'suite-id': '123',
            'payload': '{}',
            'wait-for-results': 'yes',
            'domain': 'https://api.heal.dev',
            'comment-on-pr': 'yes',
            'github-token': 'fake-github-token'
        };

        beforeEach(() => {

            core.getInput.mockImplementation((name) => mockInputs[name]);
        });

        it('should execute successfully and wait for results', async () => {
            const triggerResponse = {
                ok: true,
                json: () => Promise.resolve({
                    executionId: 'exec-123',
                    url: 'https://test.com/exec-123'
                })
            };


            const runningResponse = {
                ok: true,
                json: () => Promise.resolve({
                    status: 'running'
                })
            };

            const finishedResponse = {
                ok: true,
                json: () => Promise.resolve({
                    status: 'finished',
                    runs: [
                        { id: 1, status: 'finished', result: 'PASS', url: 'https://test.com/run/1' }
                    ]
                })
            };

            const fetchMock = jest.spyOn(global, 'fetch')
                .mockImplementationOnce(() => Promise.resolve(triggerResponse))
                // First status check returns running
                .mockImplementationOnce(() => Promise.resolve(runningResponse))
                // Second status check returns finished
                .mockImplementationOnce(() => Promise.resolve(finishedResponse));

            // Start the run function
            const runPromise = run();
            await jest.advanceTimersByTimeAsync(5000);
            await Promise.resolve();

            await jest.advanceTimersByTimeAsync(5000);
            await Promise.resolve();

            // Wait for all promises to resolve
            await runPromise;
            expect(fetchMock).toHaveBeenCalledTimes(3);
            expect(core.setOutput).toHaveBeenCalledWith('execution-id', 'exec-123');
            expect(core.info).toHaveBeenCalledWith('Execution finished.');
            expect(core.setFailed).not.toHaveBeenCalled();
        });

        it('should handle invalid JSON payload', async () => {
            core.getInput.mockImplementation((name) =>
                name === 'payload' ? 'invalid-json' : mockInputs[name]
            );

            await run();

            expect(core.setFailed).toHaveBeenCalledWith(
                expect.stringContaining('Invalid JSON payload')
            );
        });

        it('should handle API error', async () => {
            global.fetch.mockImplementationOnce(() => Promise.resolve({
                ok: false,
                status: 500
            }));

            await run();

            expect(core.setFailed).toHaveBeenCalledWith(
                expect.stringContaining('HTTP error')
            );
        });

        it('should handle execution timeout', async () => {
            const fetchMock = jest.spyOn(global, 'fetch')
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        executionId: 'exec-123',
                        url: 'https://test.com/exec-123'
                    })
                }))
                .mockImplementation(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        status: 'running'
                    })
                }));

            const runPromise = run();

            // Instead of using a loop, advance time directly past the timeout
            await jest.advanceTimersByTimeAsync(16 * 60 * 1000); // 16 minutes (past the 15-minute timeout)

            // Ensure all pending promises are resolved
            await Promise.resolve();
            await Promise.resolve();

            // Wait for the run promise to complete
            await runPromise;

            expect(core.setFailed).toHaveBeenCalledWith('Execution timed out.');
            expect(fetchMock).toHaveBeenCalled();
        }, 100000);

        it('should handle failed tests', async () => {
            const fetchMock = jest.spyOn(global, 'fetch')
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        executionId: 'exec-123',
                        url: 'https://test.com/exec-123'
                    })
                }))
                .mockImplementationOnce(() => Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        status: 'finished',
                        runs: [
                            { id: 1, status: 'finished', result: 'FAIL', url: 'https://test.com/run/1' }
                        ]
                    })
                }));

            // Start the run function
            const runPromise = run();

            await jest.advanceTimersByTimeAsync(5000);
            // Let the promises resolve
            await Promise.resolve();

            // Wait for all promises to resolve
            await runPromise;

            expect(core.setFailed).toHaveBeenCalledWith(
                expect.stringContaining('One or more runs failed')
            );
        });

        it('should skip waiting for results when configured', async () => {
            core.getInput.mockImplementation((name) =>
                name === 'wait-for-results' ? 'no' : mockInputs[name]
            );

            global.fetch.mockImplementationOnce(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    executionId: 'exec-123',
                    url: 'https://test.com/exec-123'
                })
            }));

            await run();

            expect(core.info).toHaveBeenCalledWith('Not waiting for execution to finish.');
            expect(fetch).toHaveBeenCalledTimes(1);
        });
    });
});